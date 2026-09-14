-- ORHA transactional gate for server-authoritative global role management.
-- Run after migrations through 20260914102000. The final ROLLBACK is intentional.

begin;
set local statement_timeout = '60s';
set local lock_timeout = '5s';

select pg_advisory_xact_lock(hashtextextended('orha:supabase-role-management-integration:v1', 0));

create function pg_temp.assert_true(condition boolean, failure_message text)
returns void
language plpgsql
as $$
begin
  if condition is distinct from true then
    raise exception 'Role management assertion failed: %', failure_message using errcode = 'P0001';
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
    raise exception 'Role management assertion failed: %', failure_message using errcode = 'P0001';
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
  ('27272727-2727-4727-8727-000000000001'::uuid, 'role-super-one@orha.invalid'),
  ('27272727-2727-4727-8727-000000000002'::uuid, 'role-super-two@orha.invalid'),
  ('27272727-2727-4727-8727-000000000003'::uuid, 'role-admin@orha.invalid'),
  ('27272727-2727-4727-8727-000000000004'::uuid, 'role-moderator@orha.invalid'),
  ('27272727-2727-4727-8727-000000000005'::uuid, 'role-user@orha.invalid')
) as fixture(id, email);

update public.profiles
set full_name = case id
      when '27272727-2727-4727-8727-000000000001'::uuid then 'Role Super One'
      when '27272727-2727-4727-8727-000000000002'::uuid then 'Role Super Two'
      when '27272727-2727-4727-8727-000000000003'::uuid then 'Role Admin'
      when '27272727-2727-4727-8727-000000000004'::uuid then 'Role Moderator'
      else 'Role User'
    end,
    username = case id
      when '27272727-2727-4727-8727-000000000001'::uuid then 'role.super.one'
      when '27272727-2727-4727-8727-000000000002'::uuid then 'role.super.two'
      when '27272727-2727-4727-8727-000000000003'::uuid then 'role.admin'
      when '27272727-2727-4727-8727-000000000004'::uuid then 'role.moderator'
      else 'role.user'
    end,
    birth_date = date '1990-01-01',
    state_code = 'SP',
    city = 'São Paulo',
    bio = 'Synthetic transactional role gate profile.',
    onboarding_step = 5
where id::text like '27272727-2727-4727-8727-%';

do $$
declare
  actor_id uuid;
begin
  foreach actor_id in array array[
    '27272727-2727-4727-8727-000000000001'::uuid,
    '27272727-2727-4727-8727-000000000002'::uuid,
    '27272727-2727-4727-8727-000000000003'::uuid,
    '27272727-2727-4727-8727-000000000004'::uuid,
    '27272727-2727-4727-8727-000000000005'::uuid
  ] loop
    perform set_config(
      'request.jwt.claims',
      jsonb_build_object('sub', actor_id, 'role', 'authenticated')::text,
      true
    );
    perform public.complete_own_onboarding();
  end loop;
end
$$;

update public.user_roles
set role = case user_id
  when '27272727-2727-4727-8727-000000000001'::uuid then 'super_admin'::public.app_role
  when '27272727-2727-4727-8727-000000000002'::uuid then 'super_admin'::public.app_role
  when '27272727-2727-4727-8727-000000000003'::uuid then 'admin'::public.app_role
  when '27272727-2727-4727-8727-000000000004'::uuid then 'moderator'::public.app_role
  else 'user'::public.app_role
end
where user_id::text like '27272727-2727-4727-8727-%';

select set_config(
  'request.jwt.claims',
  '{"sub":"27272727-2727-4727-8727-000000000005","role":"authenticated"}',
  true
);
set local role authenticated;

select pg_temp.assert_rejected(
  $$select * from public.list_global_role_assignments(null, 30, null, null)$$,
  'ordinary users must not list global assignments'
);
select pg_temp.assert_rejected(
  $$select * from public.assign_global_role(
    '27272727-2727-4727-8727-000000000004',
    'user',
    'Unauthorized role mutation attempt'
  )$$,
  'ordinary users must not assign roles'
);
select pg_temp.assert_rejected(
  $$update public.user_roles set role = 'admin'
    where user_id = '27272727-2727-4727-8727-000000000005'$$,
  'authenticated users must not write the role table directly'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"27272727-2727-4727-8727-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;

select pg_temp.assert_rejected(
  $$select * from public.list_global_role_assignments(null, 30, null, null)$$,
  'moderators must not inherit role-management authority'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"27272727-2727-4727-8727-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;

select pg_temp.assert_true(
  (select count(*) = 4 from public.list_global_role_assignments(null, 30, null, null)),
  'default role directory must list staff and omit ordinary users'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.list_global_role_assignments('role.user', 30, null, null)),
  'role managers must find an onboarded user without exposing email'
);
select pg_temp.assert_true(
  (
    select role = 'support'::public.app_role
    from public.assign_global_role(
      '27272727-2727-4727-8727-000000000005',
      'support',
      'Assign support access for the launch operations team'
    )
  ),
  'admin must be able to assign the support role'
);
select pg_temp.assert_rejected(
  $$select * from public.assign_global_role(
    '27272727-2727-4727-8727-000000000005',
    'admin',
    'Attempted privilege escalation by an admin account'
  )$$,
  'admin must not assign admin or SuperAdmin'
);
select pg_temp.assert_rejected(
  $$select * from public.assign_global_role(
    '27272727-2727-4727-8727-000000000001',
    'user',
    'Attempted modification of a protected SuperAdmin account'
  )$$,
  'admin must not modify SuperAdmin assignments'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"27272727-2727-4727-8727-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select pg_temp.assert_rejected(
  $$select * from public.assign_global_role(
    '27272727-2727-4727-8727-000000000001',
    'admin',
    'Attempted self demotion by a role manager account'
  )$$,
  'role managers must not change their own assignment'
);
select pg_temp.assert_true(
  (
    select role = 'admin'::public.app_role
    from public.assign_global_role(
      '27272727-2727-4727-8727-000000000005',
      'admin',
      'Promote the verified operations lead after security review'
    )
  ),
  'SuperAdmin must be able to assign admin'
);
select pg_temp.assert_true(
  (
    select role = 'admin'::public.app_role
    from public.assign_global_role(
      '27272727-2727-4727-8727-000000000002',
      'admin',
      'Remove redundant SuperAdmin access after handover review'
    )
  ),
  'SuperAdmin must be able to demote another SuperAdmin while one remains'
);

reset role;

select pg_temp.assert_true(
  (
    select count(*) = 3
    from public.audit_logs
    where event_type = 'identity.global_role_changed'
      and target_id::text like '27272727-2727-4727-8727-%'
  ),
  'every accepted role mutation must have an audit event'
);
select pg_temp.assert_true(
  (
    select count(*) = 3
    from public.notifications
    where type = 'account_role_changed'
      and recipient_id::text like '27272727-2727-4727-8727-%'
  ),
  'every accepted role mutation must notify the affected account'
);

reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.assign_global_role(uuid,public.app_role,text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.list_global_role_assignments(text,integer,timestamptz,uuid)', 'EXECUTE'),
  'anonymous clients must have no global role-management surface'
);

reset role;
rollback;
