-- ORHA transactional gate for server-authoritative onboarding completion.
-- Run after migrations through 20260914090000:
--   npx supabase db query --linked --file scripts/supabase-onboarding-integration.sql --output-format json
--
-- The final ROLLBACK is intentional. The synthetic Auth identity never persists.

begin;
set local statement_timeout = '60s';
set local lock_timeout = '5s';

select pg_advisory_xact_lock(hashtextextended('orha:supabase-onboarding-integration:v1', 0));

create function pg_temp.assert_true(condition boolean, failure_message text)
returns void
language plpgsql
as $$
begin
  if condition is distinct from true then
    raise exception 'Onboarding integration assertion failed: %', failure_message
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
    raise exception 'Onboarding integration assertion failed: %', failure_message
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
) values (
  '00000000-0000-0000-0000-000000000000'::uuid,
  '25252525-2525-4525-8525-000000000001'::uuid,
  'authenticated',
  'authenticated',
  'onboarding-gate@orha.invalid',
  '',
  timezone('utc', now()),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  timezone('utc', now()),
  timezone('utc', now())
);

select set_config(
  'request.jwt.claims',
  '{"sub":"25252525-2525-4525-8525-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select pg_temp.assert_rejected(
  'select public.complete_own_onboarding()',
  'an incomplete profile must not complete onboarding'
);

update public.profiles
set full_name = 'Onboarding Gate',
    username = 'onboarding.gate',
    birth_date = date '1990-01-01',
    state_code = 'ZZ',
    city = 'Cidade Gate',
    bio = 'Perfil sintético e transacional do gate.',
    onboarding_step = 2
where id = '25252525-2525-4525-8525-000000000001'::uuid;

select pg_temp.assert_rejected(
  'select public.complete_own_onboarding()',
  'an unknown state code must not complete onboarding'
);

select pg_temp.assert_rejected(
  $$update public.profiles
    set onboarding_completed_at = timezone('utc', now())
    where id = '25252525-2525-4525-8525-000000000001'::uuid$$,
  'authenticated must not write onboarding_completed_at directly'
);

update public.profiles
set state_code = 'SP'
where id = '25252525-2525-4525-8525-000000000001'::uuid;

select public.complete_own_onboarding();

select pg_temp.assert_true(
  (
    select onboarding_step = 6
      and onboarding_completed_at is not null
      and onboarding_completed_at between timezone('utc', now()) - interval '5 seconds'
        and timezone('utc', now())
    from public.profiles
    where id = '25252525-2525-4525-8525-000000000001'::uuid
  ),
  'valid required data must complete with a server-derived timestamp'
);

select set_config(
  'orha.onboarding_completed_at',
  (
    select onboarding_completed_at::text
    from public.profiles
    where id = '25252525-2525-4525-8525-000000000001'::uuid
  ),
  true
);

select public.complete_own_onboarding();

select pg_temp.assert_true(
  (
    select onboarding_completed_at = current_setting('orha.onboarding_completed_at')::timestamptz
    from public.profiles
    where id = '25252525-2525-4525-8525-000000000001'::uuid
  ),
  'retries must preserve the first completion timestamp'
);

reset role;

select pg_temp.assert_true(
  not has_column_privilege(
    'authenticated',
    'public.profiles',
    'onboarding_completed_at',
    'UPDATE'
  ),
  'the completion column must remain RPC-only'
);

select pg_temp.assert_true(
  has_function_privilege(
    'authenticated',
    'public.complete_own_onboarding()',
    'EXECUTE'
  ),
  'authenticated must execute the completion RPC'
);

select pg_temp.assert_true(
  not has_function_privilege(
    'anon',
    'public.complete_own_onboarding()',
    'EXECUTE'
  ),
  'anon must not execute the completion RPC'
);

rollback;
