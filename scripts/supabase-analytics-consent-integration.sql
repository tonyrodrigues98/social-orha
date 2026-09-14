-- ORHA transactional gate for persisted, owner-scoped analytics consent.
-- Run after migrations through 20260914104000. The final ROLLBACK is intentional.

begin;
set local statement_timeout = '30s';
set local lock_timeout = '5s';

select pg_advisory_xact_lock(hashtextextended('orha:supabase-analytics-consent:v1', 0));

create function pg_temp.assert_true(condition boolean, failure_message text)
returns void
language plpgsql
as $$
begin
  if condition is distinct from true then
    raise exception 'Analytics consent assertion failed: %', failure_message using errcode = 'P0001';
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
  exception when others then
    was_rejected := true;
  end;
  if not was_rejected then
    raise exception 'Analytics consent assertion failed: %', failure_message using errcode = 'P0001';
  end if;
end;
$$;

create function pg_temp.assert_other_user_update_hidden(other_id uuid)
returns void
language plpgsql
as $$
declare
  affected integer;
begin
  update public.user_settings
  set analytics_enabled = true
  where profile_id = other_id;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'Analytics consent assertion failed: another user setting was writable';
  end if;
end;
$$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  fixture.id,
  'authenticated',
  'authenticated',
  fixture.email,
  '',
  timezone('utc', now()),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  timezone('utc', now()),
  timezone('utc', now())
from (values
  ('29292929-2929-4929-8929-000000000001'::uuid, 'analytics-owner@orha.invalid'),
  ('29292929-2929-4929-8929-000000000002'::uuid, 'analytics-other@orha.invalid')
) as fixture(id, email);

select set_config(
  'request.jwt.claims',
  '{"sub":"29292929-2929-4929-8929-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select pg_temp.assert_true(
  (select not analytics_enabled and analytics_consent_updated_at is null
   from public.user_settings
   where profile_id = '29292929-2929-4929-8929-000000000001'),
  'new accounts must start with analytics disabled and no synthetic consent timestamp'
);

update public.user_settings
set analytics_enabled = true
where profile_id = '29292929-2929-4929-8929-000000000001';

select pg_temp.assert_true(
  (select analytics_enabled and analytics_consent_updated_at is not null
   from public.user_settings
   where profile_id = '29292929-2929-4929-8929-000000000001'),
  'the owner must be able to persist opt-in with a server timestamp'
);

select pg_temp.assert_other_user_update_hidden(
  '29292929-2929-4929-8929-000000000002'::uuid
);

select pg_temp.assert_rejected(
  $$update public.user_settings
    set analytics_consent_updated_at = timezone('utc', now())
    where profile_id = '29292929-2929-4929-8929-000000000001'$$,
  'the browser must not forge the consent timestamp'
);

reset role;

select pg_temp.assert_true(
  (select not analytics_enabled
   from public.user_settings
   where profile_id = '29292929-2929-4929-8929-000000000002'),
  'an attempted cross-user update must leave the other account unchanged'
);

rollback;
