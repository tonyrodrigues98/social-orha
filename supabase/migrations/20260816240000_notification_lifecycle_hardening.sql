-- ORHA notification lifecycle hardening.
--
-- Forward-only migration. Community context is projected through typed foreign keys,
-- community fanout is bounded per mutation, and trusted system notices cannot be
-- suppressed by a browser preference update.

do $$
declare
  required_table text;
begin
  foreach required_table in array array[
    'profiles',
    'notification_preferences',
    'notifications',
    'communities',
    'community_memberships',
    'community_posts',
    'audit_logs'
  ] loop
    if to_regclass('public.' || required_table) is null then
      raise exception 'Notification hardening dependency public.% is missing.', required_table
        using errcode = '55000';
    end if;
  end loop;

  if to_regprocedure(
      'private.enqueue_notification(uuid,uuid,text,text,uuid,jsonb,text,text)'
    ) is null
    or to_regprocedure('private.is_socially_active(uuid)') is null
    or to_regprocedure('private.is_blocked_between(uuid,uuid)') is null then
    raise exception 'Apply the social launch contracts before notification hardening.'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name in ('community_id', 'post_id')
  ) then
    raise exception 'Typed notification context already exists; do not replay this forward-only migration.'
      using errcode = '55000';
  end if;
end
$$;

alter table public.notifications
  add column community_id uuid references public.communities(id) on delete set null,
  add column post_id uuid references public.community_posts(id) on delete set null;

create index notifications_recipient_community_idx
on public.notifications (recipient_id, community_id, created_at desc)
where community_id is not null;

create index notifications_recipient_post_idx
on public.notifications (recipient_id, post_id, created_at desc)
where post_id is not null;

create or replace function private.enqueue_notification(
  p_recipient_id uuid,
  p_actor_id uuid,
  p_type text,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_dedupe_key text default null,
  p_channel text default 'social'
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  notification_id uuid;
  enabled boolean;
  resolved_community_id uuid;
  resolved_post_id uuid;
begin
  if p_recipient_id is null or p_recipient_id = p_actor_id then
    return null;
  end if;
  if p_channel not in ('social', 'messages', 'community', 'system') then
    raise exception 'Invalid notification channel.' using errcode = '22023';
  end if;
  if p_payload is null
    or jsonb_typeof(p_payload) <> 'object'
    or octet_length(p_payload::text) > 8192 then
    raise exception 'Invalid notification payload.' using errcode = '22023';
  end if;

  -- The entity remains the canonical navigation target. These two typed columns are
  -- a narrow, server-derived projection for precise community/post deep links.
  case p_entity_type
    when 'community' then
      select community.id into resolved_community_id
      from public.communities as community
      where community.id = p_entity_id;
    when 'community_post' then
      select post.id, post.community_id
      into resolved_post_id, resolved_community_id
      from public.community_posts as post
      where post.id = p_entity_id;
    when 'post_comment' then
      select post.id, post.community_id
      into resolved_post_id, resolved_community_id
      from public.post_comments as comment
      join public.community_posts as post on post.id = comment.post_id
      where comment.id = p_entity_id;
    else
      resolved_community_id := null;
      resolved_post_id := null;
  end case;

  -- System is a trusted critical channel. In-app delivery is mandatory even if a
  -- hostile or stale client writes system_enabled=false. E-mail and push remain
  -- separate transport preferences and are not delivery claims here.
  if p_channel = 'system' then
    enabled := true;
  else
    select case p_channel
      when 'social' then preference.social_enabled
      when 'messages' then preference.messages_enabled
      when 'community' then preference.community_enabled
    end
    into enabled
    from public.notification_preferences as preference
    where preference.profile_id = p_recipient_id;
  end if;

  if not coalesce(enabled, true) then
    return null;
  end if;

  insert into public.notifications (
    recipient_id,
    actor_id,
    type,
    entity_type,
    entity_id,
    community_id,
    post_id,
    payload,
    dedupe_key
  )
  values (
    p_recipient_id,
    p_actor_id,
    p_type,
    p_entity_type,
    p_entity_id,
    resolved_community_id,
    resolved_post_id,
    p_payload,
    p_dedupe_key
  )
  on conflict do nothing
  returning id into notification_id;

  return notification_id;
end;
$$;

create or replace function private.notify_community_membership_lifecycle()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  manager_event_type text;
  manager_dedupe_prefix text;
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending'::public.community_membership_status then
      manager_event_type := 'community_join_request';
      manager_dedupe_prefix := 'community_join_request';
    elsif new.status = 'active'::public.community_membership_status
      and new.role = 'member'::public.community_role then
      manager_event_type := 'community_member_joined';
      manager_dedupe_prefix := 'community_member_joined';
    end if;
  elsif old.status is distinct from new.status then
    if old.status = 'pending'::public.community_membership_status
      and new.status in (
        'active'::public.community_membership_status,
        'left'::public.community_membership_status
      ) then
      perform private.enqueue_notification(
        new.profile_id,
        actor_id,
        case
          when new.status = 'active'::public.community_membership_status
            then 'community_membership_accepted'
          else 'community_membership_declined'
        end,
        'community',
        new.community_id,
        '{}'::jsonb,
        'community_membership_response:' || new.community_id::text || ':'
          || new.profile_id::text || ':' || new.updated_at::text,
        'community'
      );
    elsif new.status = 'banned'::public.community_membership_status then
      perform private.enqueue_notification(
        new.profile_id,
        actor_id,
        'community_membership_banned',
        'community',
        new.community_id,
        '{}'::jsonb,
        'community_membership_banned:' || new.community_id::text || ':'
          || new.profile_id::text || ':' || new.updated_at::text,
        'system'
      );
    elsif old.status = 'banned'::public.community_membership_status
      and new.status <> 'banned'::public.community_membership_status then
      perform private.enqueue_notification(
        new.profile_id,
        actor_id,
        'community_membership_unbanned',
        'community',
        new.community_id,
        '{}'::jsonb,
        'community_membership_unbanned:' || new.community_id::text || ':'
          || new.profile_id::text || ':' || new.updated_at::text,
        'system'
      );
    elsif old.status = 'active'::public.community_membership_status
      and new.status = 'left'::public.community_membership_status
      and actor_id = new.profile_id then
      manager_event_type := 'community_member_left';
      manager_dedupe_prefix := 'community_member_left';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.role is distinct from new.role
      and new.status = 'active'::public.community_membership_status then
      perform private.enqueue_notification(
        new.profile_id,
        actor_id,
        'community_role_changed',
        'community',
        new.community_id,
        jsonb_build_object('role', new.role::text),
        'community_role_changed:' || new.community_id::text || ':'
          || new.profile_id::text || ':' || new.updated_at::text,
        'system'
      );
    end if;
  end if;

  if manager_event_type is not null then
    -- A request/join/leave reaches at most twenty active managers. Owners are
    -- considered first, then moderators, with deterministic tie-breaking.
    perform private.enqueue_notification(
      manager.profile_id,
      new.profile_id,
      manager_event_type,
      'community',
      new.community_id,
      '{}'::jsonb,
      manager_dedupe_prefix || ':' || new.community_id::text || ':'
        || new.profile_id::text || ':' || new.updated_at::text,
      'community'
    )
    from (
      select membership.profile_id
      from public.community_memberships as membership
      where membership.community_id = new.community_id
        and membership.status = 'active'
        and membership.role in ('owner', 'moderator')
        and membership.profile_id <> new.profile_id
        and private.is_socially_active(membership.profile_id)
        and not private.is_blocked_between(membership.profile_id, new.profile_id)
      order by
        case membership.role when 'owner' then 0 else 1 end,
        membership.joined_at,
        membership.profile_id
      limit 20
    ) as manager;
  end if;

  return new;
end;
$$;

create trigger community_memberships_notify_lifecycle
after insert or update of status, role on public.community_memberships
for each row execute function private.notify_community_membership_lifecycle();

create or replace function private.notify_community_post_lifecycle()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  delivered_count integer := 0;
  fanout_truncated boolean := false;
begin
  if tg_op = 'INSERT' then
    if new.community_id is not null
      and new.status = 'active'::public.content_status then
      with recipients as (
      select membership.profile_id
      from public.community_memberships as membership
      join public.notification_preferences as preference
        on preference.profile_id = membership.profile_id
      where membership.community_id = new.community_id
        and membership.status = 'active'
        and membership.profile_id <> new.author_id
        and preference.community_enabled
        and private.is_socially_active(membership.profile_id)
        and not private.is_blocked_between(membership.profile_id, new.author_id)
      order by membership.joined_at desc, membership.profile_id
      limit 250
    )
      insert into public.notifications (
      recipient_id,
      actor_id,
      type,
      entity_type,
      entity_id,
      community_id,
      post_id,
      payload,
      dedupe_key
    )
      select
      recipient.profile_id,
      new.author_id,
      'community_post_created',
      'community_post',
      new.id,
      new.community_id,
      new.id,
      '{}'::jsonb,
      'community_post_created:' || new.id::text
      from recipients as recipient
      on conflict do nothing;

      get diagnostics delivered_count = row_count;

      if delivered_count = 250 then
        select exists (
        select 1
        from public.community_memberships as membership
        join public.notification_preferences as preference
          on preference.profile_id = membership.profile_id
        where membership.community_id = new.community_id
          and membership.status = 'active'
          and membership.profile_id <> new.author_id
          and preference.community_enabled
          and private.is_socially_active(membership.profile_id)
          and not private.is_blocked_between(membership.profile_id, new.author_id)
        offset 250
        limit 1
        ) into fanout_truncated;
      end if;

      if fanout_truncated then
        insert into public.audit_logs (
        actor_id,
        event_type,
        target_type,
        target_id,
        metadata
      )
        values (
        new.author_id,
        'notification.community_post_fanout_truncated',
        'community_post',
        new.id,
        jsonb_build_object(
          'community_id', new.community_id,
          'recipient_limit', 250
        )
        );
      end if;
    end if;
  elsif tg_op = 'UPDATE' then
    if old.status is distinct from new.status
      and new.status = 'removed'::public.content_status
      and actor_id is not null
      and new.author_id is not null
      and actor_id <> new.author_id then
      perform private.enqueue_notification(
        new.author_id,
        actor_id,
        'community_post_removed',
        'community_post',
        new.id,
        '{}'::jsonb,
        'community_post_removed:' || new.id::text,
        'system'
      );
    end if;
  end if;

  return new;
end;
$$;

create trigger community_posts_notify_lifecycle
after insert or update of status on public.community_posts
for each row execute function private.notify_community_post_lifecycle();

revoke all on function private.enqueue_notification(uuid, uuid, text, text, uuid, jsonb, text, text)
  from public, anon, authenticated;
revoke all on function private.notify_community_membership_lifecycle()
  from public, anon, authenticated;
revoke all on function private.notify_community_post_lifecycle()
  from public, anon, authenticated;

comment on column public.notifications.community_id is
  'Server-derived community context for a safe, precise deep link; never accepted from browser payload.';
comment on column public.notifications.post_id is
  'Server-derived post context for a safe, precise deep link; never accepted from browser payload.';
comment on function private.enqueue_notification(uuid, uuid, text, text, uuid, jsonb, text, text) is
  'Preference-aware notification insert. The trusted system channel is mandatory and community/post context is derived server-side.';

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'community_id'
      and data_type = 'uuid'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'post_id'
      and data_type = 'uuid'
  ) then
    raise exception 'Typed notification deep-link context is incomplete.' using errcode = '55000';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'community_memberships_notify_lifecycle'
      and not tgisinternal
      and tgenabled <> 'D'
  ) or not exists (
    select 1 from pg_trigger
    where tgname = 'community_posts_notify_lifecycle'
      and not tgisinternal
      and tgenabled <> 'D'
  ) then
    raise exception 'Community notification lifecycle triggers are incomplete.' using errcode = '55000';
  end if;

  if position(
    'if p_channel = ''system''' in pg_get_functiondef(
      'private.enqueue_notification(uuid,uuid,text,text,uuid,jsonb,text,text)'::regprocedure
    )
  ) = 0 then
    raise exception 'Critical system notifications can still be suppressed by preferences.'
      using errcode = '55000';
  end if;

  if position(
    'limit 250' in pg_get_functiondef(
      'private.notify_community_post_lifecycle()'::regprocedure
    )
  ) = 0 or position(
    'limit 20' in pg_get_functiondef(
      'private.notify_community_membership_lifecycle()'::regprocedure
    )
  ) = 0 then
    raise exception 'Community notification fanout is no longer bounded.' using errcode = '55000';
  end if;

  if has_function_privilege(
    'authenticated',
    'private.enqueue_notification(uuid,uuid,text,text,uuid,jsonb,text,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'private.notify_community_membership_lifecycle()',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'private.notify_community_post_lifecycle()',
    'EXECUTE'
  ) then
    raise exception 'Browser roles can invoke trusted notification producers.' using errcode = '55000';
  end if;
end
$$;
