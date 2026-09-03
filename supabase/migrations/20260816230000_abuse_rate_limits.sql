-- ORHA abuse-control windows.
--
-- Forward-only migration. The counters live in the private schema, are consumed by
-- authoritative table triggers, and never contain message bodies, report details,
-- target identifiers, IP addresses, or other user payloads.

do $$
declare
  required_table text;
begin
  foreach required_table in array array[
    'profiles',
    'friendships',
    'conversation_requests',
    'community_posts',
    'post_comments',
    'messages',
    'reports',
    'audit_logs'
  ] loop
    if to_regclass('public.' || required_table) is null then
      raise exception 'Abuse-control migration dependency public.% is missing.', required_table
        using errcode = '55000';
    end if;
  end loop;

  if to_regprocedure('private.is_blocked_between(uuid,uuid)') is null
    or to_regprocedure('private.is_socially_active(uuid)') is null
    or to_regprocedure('public.request_friendship(uuid)') is null
    or to_regprocedure('public.request_conversation(uuid,text)') is null
    or to_regprocedure('public.send_message(uuid,public.message_kind,text,uuid,uuid)') is null
    or to_regprocedure('public.create_report(public.report_target_type,uuid,text,text)') is null then
    raise exception 'Apply the social, Edge, and conversation-control migrations before abuse controls.'
      using errcode = '55000';
  end if;

  if to_regclass('private.actor_rate_limit_policies') is not null
    or to_regclass('private.actor_rate_limit_windows') is not null then
    raise exception 'ORHA abuse-control tables already exist; do not replay this forward-only migration.'
      using errcode = '55000';
  end if;
end
$$;

create table private.actor_rate_limit_policies (
  action text not null,
  window_seconds integer not null,
  max_requests integer not null,
  audit_at_capacity boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (action, window_seconds),
  constraint actor_rate_limit_policy_action_format
    check (action ~ '^[a-z][a-z0-9_]{2,49}$'),
  constraint actor_rate_limit_policy_window_bounds
    check (window_seconds between 1 and 604800),
  constraint actor_rate_limit_policy_request_bounds
    check (max_requests between 1 and 10000)
);

create table private.actor_rate_limit_windows (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  window_seconds integer not null,
  window_started_at timestamptz not null,
  window_expires_at timestamptz not null,
  request_count integer not null,
  first_consumed_at timestamptz not null,
  last_consumed_at timestamptz not null,
  primary key (actor_id, action, window_seconds, window_started_at),
  constraint actor_rate_limit_windows_policy_fkey
    foreign key (action, window_seconds)
    references private.actor_rate_limit_policies(action, window_seconds)
    on update restrict on delete cascade,
  constraint actor_rate_limit_window_time_order
    check (window_expires_at > window_started_at),
  constraint actor_rate_limit_window_count_positive
    check (request_count > 0),
  constraint actor_rate_limit_window_consumption_order
    check (
      first_consumed_at >= window_started_at
      and last_consumed_at >= first_consumed_at
      and last_consumed_at <= window_expires_at
    )
);

create index actor_rate_limit_windows_cleanup_idx
on private.actor_rate_limit_windows (window_expires_at, actor_id);

-- The two windows per action bound short bursts and sustained abuse independently.
-- Values are intentionally conservative launch defaults and can only be changed by a
-- forward migration or another trusted database operation.
insert into private.actor_rate_limit_policies (
  action,
  window_seconds,
  max_requests,
  audit_at_capacity
)
values
  ('friendship_request',       3600,  20, true),
  ('friendship_request',      86400,  50, true),
  ('conversation_request',     3600,  10, true),
  ('conversation_request',    86400,  30, true),
  ('report_create',             600,   3, true),
  ('report_create',           86400,  10, true),
  ('community_post_create',     600,  10, false),
  ('community_post_create',   86400,  50, false),
  ('post_comment_create',       600,  30, false),
  ('post_comment_create',     86400, 200, false),
  ('message_send',               10,  30, false),
  ('message_send',               60, 180, false);

create or replace function private.consume_actor_rate_limits(
  p_actor_id uuid,
  p_action text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  policy_record private.actor_rate_limit_policies;
  policy_count integer := 0;
  current_count integer;
  consumed_at timestamptz;
  window_start timestamptz;
  window_end timestamptz;
  retry_after_seconds integer;
begin
  if p_actor_id is null then
    return;
  end if;
  if p_action is null or p_action !~ '^[a-z][a-z0-9_]{2,49}$' then
    raise exception 'Invalid rate-limit action.' using errcode = '22023';
  end if;

  -- One timestamp keeps overlapping windows internally consistent for this mutation.
  consumed_at := clock_timestamp();

  for policy_record in
    select policy.*
    from private.actor_rate_limit_policies as policy
    where policy.action = p_action
    order by policy.window_seconds
  loop
    policy_count := policy_count + 1;
    window_start := to_timestamp(
      floor(extract(epoch from consumed_at) / policy_record.window_seconds)
      * policy_record.window_seconds
    );
    window_end := window_start + make_interval(secs => policy_record.window_seconds);

    insert into private.actor_rate_limit_windows (
      actor_id,
      action,
      window_seconds,
      window_started_at,
      window_expires_at,
      request_count,
      first_consumed_at,
      last_consumed_at
    )
    values (
      p_actor_id,
      p_action,
      policy_record.window_seconds,
      window_start,
      window_end,
      1,
      consumed_at,
      consumed_at
    )
    on conflict (actor_id, action, window_seconds, window_started_at)
    do update set
      request_count = private.actor_rate_limit_windows.request_count + 1,
      last_consumed_at = excluded.last_consumed_at
    returning request_count into current_count;

    if current_count > policy_record.max_requests then
      retry_after_seconds := greatest(
        1,
        ceil(extract(epoch from (window_end - clock_timestamp())))::integer
      );

      -- PostgREST maps PT429 to HTTP 429. Raising rolls back both the protected
      -- mutation and the over-limit increment, leaving the counter capped at max.
      raise sqlstate 'PT429'
        using message = 'Too many requests.',
              detail = jsonb_build_object(
                'action', p_action,
                'retry_after_seconds', retry_after_seconds
              )::text,
              hint = 'Retry after the current rate-limit window.';
    end if;

    -- PostgreSQL has no autonomous transaction for a denied request. Record the
    -- last allowed sensitive operation instead: it commits once per policy window
    -- and contains no target or content payload.
    if policy_record.audit_at_capacity
      and current_count = policy_record.max_requests then
      insert into public.audit_logs (
        actor_id,
        event_type,
        metadata
      )
      values (
        p_actor_id,
        'security.rate_limit_capacity',
        jsonb_build_object(
          'action', p_action,
          'window_seconds', policy_record.window_seconds,
          'max_requests', policy_record.max_requests,
          'window_started_at', window_start
        )
      );
    end if;
  end loop;

  if policy_count = 0 then
    raise exception 'Rate-limit policy is unavailable.' using errcode = '55000';
  end if;
end;
$$;

create or replace function private.enforce_actor_rate_limit()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  action_name text;
begin
  if tg_table_schema <> 'public' then
    raise exception 'Unexpected rate-limit trigger schema.' using errcode = '55000';
  end if;

  case tg_table_name
    when 'friendships' then
      if tg_op = 'UPDATE' then
        if not (
          new.status = 'pending'::public.friendship_status
          and (
            old.status is distinct from 'pending'::public.friendship_status
            or old.requester_id is distinct from new.requester_id
          )
        ) then
          return new;
        end if;
      end if;
      actor_id := new.requester_id;
      action_name := 'friendship_request';
    when 'conversation_requests' then
      if tg_op = 'UPDATE' then
        if not (
          new.status = 'pending'::public.conversation_request_status
          and old.status is distinct from 'pending'::public.conversation_request_status
        ) then
          return new;
        end if;
      elsif new.status <> 'pending'::public.conversation_request_status then
        -- Friends can open their already-consented direct conversation without
        -- spending a request quota; only the consent-request lifecycle is bounded.
        return new;
      end if;
      actor_id := new.requester_id;
      action_name := 'conversation_request';
    when 'community_posts' then
      actor_id := new.author_id;
      action_name := 'community_post_create';
    when 'post_comments' then
      actor_id := new.author_id;
      action_name := 'post_comment_create';
    when 'messages' then
      actor_id := new.sender_id;
      action_name := 'message_send';
    when 'reports' then
      actor_id := new.reporter_id;
      action_name := 'report_create';
    else
      raise exception 'Unexpected rate-limit trigger table.' using errcode = '55000';
  end case;

  perform private.consume_actor_rate_limits(actor_id, action_name);
  return new;
end;
$$;

create trigger enforce_friendship_request_rate_limit
before insert or update of requester_id, status on public.friendships
for each row execute function private.enforce_actor_rate_limit();

create trigger enforce_conversation_request_rate_limit
before insert or update of requester_id, status on public.conversation_requests
for each row execute function private.enforce_actor_rate_limit();

create trigger enforce_community_post_create_rate_limit
before insert on public.community_posts
for each row execute function private.enforce_actor_rate_limit();

create trigger enforce_post_comment_create_rate_limit
before insert on public.post_comments
for each row execute function private.enforce_actor_rate_limit();

create trigger enforce_message_send_rate_limit
before insert on public.messages
for each row execute function private.enforce_actor_rate_limit();

create trigger enforce_report_create_rate_limit
before insert on public.reports
for each row execute function private.enforce_actor_rate_limit();

create or replace function public.cleanup_actor_rate_limit_windows(
  p_limit integer default 10000
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  if p_limit is null or p_limit not between 1 and 50000 then
    raise exception 'Cleanup limit must be between 1 and 50000.' using errcode = '22023';
  end if;

  with expired as (
    select window.actor_id,
           window.action,
           window.window_seconds,
           window.window_started_at
    from private.actor_rate_limit_windows as window
    where window.window_expires_at < timezone('utc', now()) - interval '48 hours'
    order by window.window_expires_at, window.actor_id
    limit p_limit
    for update skip locked
  ), removed as (
    delete from private.actor_rate_limit_windows as window
    using expired
    where window.actor_id = expired.actor_id
      and window.action = expired.action
      and window.window_seconds = expired.window_seconds
      and window.window_started_at = expired.window_started_at
    returning 1
  )
  select count(*)::integer into deleted_count from removed;

  return deleted_count;
end;
$$;

revoke all on table private.actor_rate_limit_policies from public, anon, authenticated;
revoke all on table private.actor_rate_limit_windows from public, anon, authenticated;
revoke all on function private.consume_actor_rate_limits(uuid, text) from public, anon, authenticated;
revoke all on function private.enforce_actor_rate_limit() from public, anon, authenticated;
revoke all on function public.cleanup_actor_rate_limit_windows(integer) from public, anon, authenticated;
grant execute on function public.cleanup_actor_rate_limit_windows(integer) to service_role;

comment on table private.actor_rate_limit_policies is
  'Trusted launch limits for actor mutations. Contains no user content or target identifiers.';
comment on table private.actor_rate_limit_windows is
  'Concurrency-safe fixed-window counters keyed only by actor, action, and time window.';
comment on function private.consume_actor_rate_limits(uuid, text) is
  'Consumes all configured windows atomically and raises PT429 for PostgREST when capacity is exceeded.';
comment on function public.cleanup_actor_rate_limit_windows(integer) is
  'Service-role cleanup for expired abuse-control counters; retains a 48-hour operational buffer.';

do $$
declare
  required_trigger text;
begin
  if (select count(*) from private.actor_rate_limit_policies) <> 12 then
    raise exception 'The abuse-control policy matrix is incomplete.' using errcode = '55000';
  end if;

  if exists (
    select 1
    from private.actor_rate_limit_policies
    group by action
    having count(*) <> 2
  ) then
    raise exception 'Every protected action must have exactly two rate-limit windows.' using errcode = '55000';
  end if;

  foreach required_trigger in array array[
    'enforce_friendship_request_rate_limit',
    'enforce_conversation_request_rate_limit',
    'enforce_community_post_create_rate_limit',
    'enforce_post_comment_create_rate_limit',
    'enforce_message_send_rate_limit',
    'enforce_report_create_rate_limit'
  ] loop
    if not exists (
      select 1
      from pg_trigger
      where tgname = required_trigger
        and not tgisinternal
        and tgenabled <> 'D'
    ) then
      raise exception 'Required abuse-control trigger % is missing.', required_trigger
        using errcode = '55000';
    end if;
  end loop;

  if not exists (
    select 1
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'private'
      and procedure.proname = 'consume_actor_rate_limits'
      and procedure.prosecdef
      and procedure.provolatile = 'v'
      and procedure.proconfig @> array['search_path=']::text[]
  ) then
    raise exception 'The authoritative rate-limit consumer is not hardened.' using errcode = '55000';
  end if;

  if position(
    'PT429' in pg_get_functiondef(
      'private.consume_actor_rate_limits(uuid,text)'::regprocedure
    )
  ) = 0 then
    raise exception 'The rate-limit consumer no longer maps denials to HTTP 429.' using errcode = '55000';
  end if;

  if has_table_privilege('authenticated', 'private.actor_rate_limit_policies', 'SELECT')
    or has_table_privilege('authenticated', 'private.actor_rate_limit_windows', 'SELECT')
    or has_function_privilege(
      'authenticated',
      'private.consume_actor_rate_limits(uuid,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'private.enforce_actor_rate_limit()',
      'EXECUTE'
    ) then
    raise exception 'Browser roles can access private abuse-control state.' using errcode = '55000';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.cleanup_actor_rate_limit_windows(integer)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.cleanup_actor_rate_limit_windows(integer)',
    'EXECUTE'
  ) then
    raise exception 'Abuse-control cleanup grants are invalid.' using errcode = '55000';
  end if;
end
$$;
