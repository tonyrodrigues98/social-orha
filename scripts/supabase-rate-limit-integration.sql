-- ORHA transactional abuse-control integration gate.
-- Run only after migrations through 20260816230000 are applied:
--   npx supabase db query --linked --file scripts/supabase-rate-limit-integration.sql --output-format json
--
-- The final ROLLBACK is intentional. Policy changes, Auth fixtures, posts, counters,
-- blocks, and audit rows created by this gate never persist.

begin;
set local statement_timeout = '60s';
set local lock_timeout = '5s';

select pg_advisory_xact_lock(hashtextextended('orha:supabase-rate-limit-integration:v1', 0));

create function pg_temp.assert_true(condition boolean, failure_message text)
returns void
language plpgsql
as $$
begin
  if condition is distinct from true then
    raise exception 'Rate-limit integration assertion failed: %', failure_message
      using errcode = 'P0001';
  end if;
end;
$$;

create function pg_temp.assert_rejected(statement text, failure_message text)
returns void
language plpgsql
as $$
declare
  was_rejected boolean := false;
begin
  begin
    execute statement;
  exception
    when others then
      was_rejected := true;
  end;

  if not was_rejected then
    raise exception 'Rate-limit integration assertion failed: %', failure_message
      using errcode = 'P0001';
  end if;
end;
$$;

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  actor.id,
  'authenticated',
  'authenticated',
  actor.email,
  '',
  timezone('utc', now()),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  timezone('utc', now()),
  timezone('utc', now())
from (values
  ('23232323-2323-4323-8323-000000000001'::uuid, 'rate-owner@orha.invalid'),
  ('23232323-2323-4323-8323-000000000002'::uuid, 'rate-blocked@orha.invalid')
) as actor(id, email);

update public.profiles as profile
set full_name = actor.full_name,
    username = actor.username::extensions.citext,
    birth_date = date '1990-01-01',
    state_code = 'SP',
    city = 'Sao Paulo',
    onboarding_step = 6,
    onboarding_completed_at = timezone('utc', now())
from (values
  ('23232323-2323-4323-8323-000000000001'::uuid, 'Rate Owner', 'rate.owner'),
  ('23232323-2323-4323-8323-000000000002'::uuid, 'Rate Blocked', 'rate.blocked')
) as actor(id, full_name, username)
where profile.id = actor.id;

-- Lower only the post limits inside this rollback-only transaction so PT429 is
-- exercised quickly. Enable capacity auditing to prove its payload stays minimal.
update private.actor_rate_limit_policies
set max_requests = 2,
    audit_at_capacity = true
where action = 'community_post_create';

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '23232323-2323-4323-8323-000000000001',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

insert into public.community_posts (author_id, body, visibility)
values
  ('23232323-2323-4323-8323-000000000001', 'Rate gate post one', 'public'),
  ('23232323-2323-4323-8323-000000000001', 'Rate gate post two', 'public');

do $$
declare
  was_rate_limited boolean := false;
begin
  begin
    insert into public.community_posts (author_id, body, visibility)
    values (
      '23232323-2323-4323-8323-000000000001',
      'This insert must be rolled back by PT429',
      'public'
    );
  exception
    when sqlstate 'PT429' then
      was_rate_limited := true;
  end;

  if not was_rate_limited then
    raise exception 'Rate-limit integration assertion failed: the third post must raise PT429.'
      using errcode = 'P0001';
  end if;
end;
$$;

reset role;

select pg_temp.assert_true(
  (select count(*) = 2
   from public.community_posts
   where author_id = '23232323-2323-4323-8323-000000000001'),
  'the protected mutation must roll back when PT429 is raised'
);

select pg_temp.assert_true(
  (select count(*) = 2
   from private.actor_rate_limit_windows
   where actor_id = '23232323-2323-4323-8323-000000000001'
     and action = 'community_post_create'
     and request_count = 2),
  'the denied increment must roll back at capacity for both windows'
);

select pg_temp.assert_true(
  (select count(*) = 2
   from public.audit_logs
   where actor_id = '23232323-2323-4323-8323-000000000001'
     and event_type = 'security.rate_limit_capacity'),
  'each audited policy window must emit exactly one last-allowed capacity event'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from public.audit_logs
    where actor_id = '23232323-2323-4323-8323-000000000001'
      and event_type = 'security.rate_limit_capacity'
      and (
        metadata ? 'target_id'
        or metadata ? 'body'
        or metadata ? 'details'
        or metadata ? 'payload'
        or metadata ? 'ip_address'
      )
  ),
  'capacity audit metadata must not contain target or content payload'
);

-- A blocked request must be rejected by the existing canonical predicate before a
-- friendship row is created, so it cannot consume another profile's quota indirectly.
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '23232323-2323-4323-8323-000000000001',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

select public.block_profile(
  '23232323-2323-4323-8323-000000000002'::uuid,
  'rollback-only rate gate'
);

select pg_temp.assert_rejected(
  $$select public.request_friendship('23232323-2323-4323-8323-000000000002'::uuid)$$,
  'a blocked friendship request must stay rejected'
);

reset role;

select pg_temp.assert_true(
  not exists (
    select 1
    from private.actor_rate_limit_windows
    where actor_id = '23232323-2323-4323-8323-000000000001'
      and action = 'friendship_request'
  ),
  'a blocked request must not consume a friendship quota'
);

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

select pg_temp.assert_rejected(
  'select * from private.actor_rate_limit_windows',
  'rate-limit state must be private from anon'
);
select pg_temp.assert_rejected(
  $$select private.consume_actor_rate_limits('23232323-2323-4323-8323-000000000001'::uuid, 'message_send')$$,
  'the authoritative consumer must not be executable by anon'
);

reset role;

select pg_temp.assert_true(
  not has_table_privilege('authenticated', 'private.actor_rate_limit_windows', 'SELECT')
  and not has_table_privilege('authenticated', 'private.actor_rate_limit_policies', 'SELECT')
  and not has_function_privilege(
    'authenticated',
    'private.consume_actor_rate_limits(uuid,text)',
    'EXECUTE'
  ),
  'browser roles must not inspect or consume abuse-control state directly'
);

rollback;
