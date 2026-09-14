-- ORHA transactional gate for persistent support operations.
-- Run after migrations through 20260914101000. The final ROLLBACK is intentional.

begin;
set local statement_timeout = '60s';
set local lock_timeout = '5s';

select pg_advisory_xact_lock(hashtextextended('orha:supabase-support-integration:v1', 0));

create function pg_temp.assert_true(condition boolean, failure_message text)
returns void
language plpgsql
as $$
begin
  if condition is distinct from true then
    raise exception 'Support integration assertion failed: %', failure_message using errcode = 'P0001';
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
    raise exception 'Support integration assertion failed: %', failure_message using errcode = 'P0001';
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
  ('26262626-2626-4626-8626-000000000001'::uuid, 'support-user-a@orha.invalid'),
  ('26262626-2626-4626-8626-000000000002'::uuid, 'support-user-b@orha.invalid'),
  ('26262626-2626-4626-8626-000000000003'::uuid, 'support-operator@orha.invalid'),
  ('26262626-2626-4626-8626-000000000004'::uuid, 'support-moderator@orha.invalid')
) as fixture(id, email);

update public.profiles
set full_name = case id
      when '26262626-2626-4626-8626-000000000001'::uuid then 'Support User A'
      when '26262626-2626-4626-8626-000000000002'::uuid then 'Support User B'
      when '26262626-2626-4626-8626-000000000003'::uuid then 'Support Operator'
      else 'Support Moderator'
    end,
    username = case id
      when '26262626-2626-4626-8626-000000000001'::uuid then 'support.user.a'
      when '26262626-2626-4626-8626-000000000002'::uuid then 'support.user.b'
      when '26262626-2626-4626-8626-000000000003'::uuid then 'support.operator'
      else 'support.moderator'
    end,
    birth_date = date '1990-01-01',
    state_code = 'SP',
    city = 'São Paulo',
    bio = 'Synthetic transactional support gate profile.',
    onboarding_step = 5
where id::text like '26262626-2626-4626-8626-%';

do $$
declare
  actor_id uuid;
begin
  foreach actor_id in array array[
    '26262626-2626-4626-8626-000000000001'::uuid,
    '26262626-2626-4626-8626-000000000002'::uuid,
    '26262626-2626-4626-8626-000000000003'::uuid,
    '26262626-2626-4626-8626-000000000004'::uuid
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

update public.user_roles set role = 'support'
where user_id = '26262626-2626-4626-8626-000000000003'::uuid;
update public.user_roles set role = 'moderator'
where user_id = '26262626-2626-4626-8626-000000000004'::uuid;

select set_config(
  'request.jwt.claims',
  '{"sub":"26262626-2626-4626-8626-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select pg_temp.assert_rejected(
  $$insert into public.support_tickets (requester_id, subject, category)
    values ('26262626-2626-4626-8626-000000000001', 'Direct insert', 'other')$$,
  'authenticated users must not write support tables directly'
);

select set_config(
  'orha.support_ticket_id',
  (public.create_support_ticket(
    'Não consigo atualizar meu perfil',
    'technical',
    'A edição retorna um erro sempre que tento salvar minha biografia.'
  )).id::text,
  true
);

select pg_temp.assert_true(
  (select count(*) = 1 from public.list_support_tickets(null, 30, null, null)),
  'requester must see the ticket through the read model'
);
select pg_temp.assert_true(
  (
    select requester_full_name = 'Support User A'
      and status = 'open'
      and priority = 'normal'
    from public.list_support_tickets(null, 30, null, null)
    where id = current_setting('orha.support_ticket_id')::uuid
  ),
  'the requester read model must contain server-owned state and display data'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"26262626-2626-4626-8626-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select pg_temp.assert_true(
  (select count(*) = 0 from public.list_support_tickets(null, 30, null, null)),
  'another ordinary user must not see the ticket'
);
select pg_temp.assert_rejected(
  format(
    'select public.reply_support_ticket(%L::uuid, %L)',
    current_setting('orha.support_ticket_id'),
    'Attempted unauthorized reply'
  ),
  'another ordinary user must not reply'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"26262626-2626-4626-8626-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;

select pg_temp.assert_true(
  (select count(*) = 0 from public.list_support_tickets(null, 30, null, null)),
  'moderator must not inherit the support queue'
);
select pg_temp.assert_rejected(
  format('select public.claim_support_ticket(%L::uuid)', current_setting('orha.support_ticket_id')),
  'moderator must not claim support tickets'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"26262626-2626-4626-8626-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;

select pg_temp.assert_true(
  (select count(*) = 1 from public.list_support_tickets('open', 30, null, null)),
  'support operator must see the global queue'
);

select public.claim_support_ticket(current_setting('orha.support_ticket_id')::uuid);
select public.reply_support_ticket(
  current_setting('orha.support_ticket_id')::uuid,
  'Recebemos seu chamado e estamos verificando o salvamento do perfil.'
);
select public.update_support_ticket_state(
  current_setting('orha.support_ticket_id')::uuid,
  'resolved',
  'high'
);

select pg_temp.assert_true(
  (
    select assigned_to = '26262626-2626-4626-8626-000000000003'::uuid
      and status = 'resolved'
      and priority = 'high'
      and resolved_at is not null
    from public.list_support_tickets('resolved', 30, null, null)
    where id = current_setting('orha.support_ticket_id')::uuid
  ),
  'support state transitions must remain server-authoritative'
);

select pg_temp.assert_rejected(
  format(
    'update public.support_tickets set priority = %L where id = %L::uuid',
    'urgent',
    current_setting('orha.support_ticket_id')
  ),
  'support operators must not bypass RPC audit with direct updates'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"26262626-2626-4626-8626-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select pg_temp.assert_true(
  (
    select count(*) = 2
    from public.list_support_ticket_messages(
      current_setting('orha.support_ticket_id')::uuid,
      50,
      null,
      null
    )
  ),
  'requester must see the persistent two-message thread'
);
select pg_temp.assert_true(
  (
    select count(*) = 2
    from public.notifications
    where recipient_id = '26262626-2626-4626-8626-000000000001'::uuid
      and type in ('support_ticket_reply', 'support_ticket_updated')
      and entity_id = current_setting('orha.support_ticket_id')::uuid
  ),
  'support reply and state change must notify the requester without message payloads'
);

reset role;

select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.create_support_ticket(text,public.support_ticket_category,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.reply_support_ticket(uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.list_support_tickets(public.support_ticket_status,integer,timestamptz,uuid)', 'EXECUTE'),
  'anonymous users must not execute support RPCs'
);

select pg_temp.assert_true(
  has_function_privilege('authenticated', 'public.create_support_ticket(text,public.support_ticket_category,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.reply_support_ticket(uuid,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.claim_support_ticket(uuid)', 'EXECUTE'),
  'authenticated role must reach RPCs whose bodies enforce participant and operator authority'
);

rollback;
