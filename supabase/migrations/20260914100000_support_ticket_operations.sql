-- ORHA persistent support operations.
--
-- Support is a separate domain from private conversations. Browser clients can
-- read only tickets they are allowed to see and all writes go through
-- server-authoritative RPCs with rate limits and audit trails.

do $$
begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.user_roles') is null
    or to_regclass('public.notifications') is null
    or to_regclass('public.audit_logs') is null
    or to_regprocedure('private.account_access_enabled(uuid)') is null
    or to_regprocedure('private.consume_actor_rate_limits(uuid,text)') is null then
    raise exception 'Apply the ORHA identity, social, and abuse-control migrations before support operations.'
      using errcode = '55000';
  end if;

  if to_regclass('public.support_tickets') is not null
    or to_regclass('public.support_ticket_messages') is not null then
    raise exception 'ORHA support tables already exist; do not replay this forward-only migration.'
      using errcode = '55000';
  end if;
end
$$;

create type public.support_ticket_status as enum ('open', 'in_progress', 'resolved');
create type public.support_ticket_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.support_ticket_category as enum (
  'account',
  'access',
  'security',
  'privacy',
  'technical',
  'other'
);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null,
  category public.support_ticket_category not null,
  status public.support_ticket_status not null default 'open',
  priority public.support_ticket_priority not null default 'normal',
  assigned_to uuid references public.profiles(id) on delete set null,
  last_message_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint support_tickets_subject_length check (char_length(btrim(subject)) between 5 and 140),
  constraint support_tickets_resolution_consistency check (
    (status = 'resolved' and resolved_at is not null)
    or (status <> 'resolved' and resolved_at is null)
  )
);

create index support_tickets_requester_activity_idx
on public.support_tickets (requester_id, last_message_at desc, id desc);

create index support_tickets_queue_idx
on public.support_tickets (status, priority desc, last_message_at asc, id asc);

create index support_tickets_assignee_idx
on public.support_tickets (assigned_to, status, last_message_at desc)
where assigned_to is not null;

create table public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  body text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint support_ticket_messages_body_length check (char_length(btrim(body)) between 1 and 4000)
);

create index support_ticket_messages_ticket_cursor_idx
on public.support_ticket_messages (ticket_id, created_at, id);

create trigger support_tickets_set_updated_at
before update on public.support_tickets
for each row execute function public.set_updated_at();

create or replace function private.is_support_operator(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_profile_id is not null
    and private.account_access_enabled(p_profile_id)
    and exists (
      select 1
      from public.user_roles as role_record
      where role_record.user_id = p_profile_id
        and role_record.role in ('super_admin', 'admin', 'support')
    );
$$;

create or replace function private.can_access_support_ticket(
  p_ticket_id uuid,
  p_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_ticket_id is not null
    and p_profile_id is not null
    and private.account_access_enabled(p_profile_id)
    and exists (
      select 1
      from public.support_tickets as ticket
      where ticket.id = p_ticket_id
        and (
          ticket.requester_id = p_profile_id
          or private.is_support_operator(p_profile_id)
        )
    );
$$;

insert into private.actor_rate_limit_policies (
  action,
  window_seconds,
  max_requests,
  audit_at_capacity
)
values
  ('support_ticket_create', 3600, 5, true),
  ('support_ticket_create', 86400, 20, true),
  ('support_ticket_reply', 60, 12, false),
  ('support_ticket_reply', 86400, 100, true);

create or replace function public.create_support_ticket(
  p_subject text,
  p_category public.support_ticket_category,
  p_message text
)
returns public.support_tickets
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  ticket_record public.support_tickets;
begin
  if actor_id is null or not private.account_access_enabled(actor_id) then
    raise exception 'An active authenticated account is required.' using errcode = '42501';
  end if;
  if p_subject is null or char_length(btrim(p_subject)) not between 5 and 140 then
    raise exception 'Support subject must contain 5 to 140 characters.' using errcode = '22023';
  end if;
  if p_category is null then
    raise exception 'Support category is required.' using errcode = '22023';
  end if;
  if p_message is null or char_length(btrim(p_message)) not between 10 and 4000 then
    raise exception 'Support message must contain 10 to 4000 characters.' using errcode = '22023';
  end if;

  perform private.consume_actor_rate_limits(actor_id, 'support_ticket_create');

  insert into public.support_tickets (requester_id, subject, category)
  values (actor_id, btrim(p_subject), p_category)
  returning * into ticket_record;

  insert into public.support_ticket_messages (ticket_id, sender_id, body)
  values (ticket_record.id, actor_id, btrim(p_message));

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (
    actor_id,
    'support.ticket_created',
    'support_ticket',
    ticket_record.id,
    jsonb_build_object('category', ticket_record.category::text)
  );

  return ticket_record;
end;
$$;

create or replace function public.reply_support_ticket(
  p_ticket_id uuid,
  p_message text
)
returns public.support_ticket_messages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  ticket_record public.support_tickets;
  message_record public.support_ticket_messages;
  operator_reply boolean;
  notification_recipient uuid;
begin
  if actor_id is null or not private.account_access_enabled(actor_id) then
    raise exception 'An active authenticated account is required.' using errcode = '42501';
  end if;
  if p_ticket_id is null then
    raise exception 'Support ticket is required.' using errcode = '22023';
  end if;
  if p_message is null or char_length(btrim(p_message)) not between 1 and 4000 then
    raise exception 'Support message must contain 1 to 4000 characters.' using errcode = '22023';
  end if;

  select * into ticket_record
  from public.support_tickets
  where id = p_ticket_id
  for update;

  if not found then
    raise exception 'Support ticket not found.' using errcode = 'P0002';
  end if;

  operator_reply := private.is_support_operator(actor_id);
  if ticket_record.requester_id <> actor_id and not operator_reply then
    raise exception 'Support ticket access denied.' using errcode = '42501';
  end if;

  perform private.consume_actor_rate_limits(actor_id, 'support_ticket_reply');

  insert into public.support_ticket_messages (ticket_id, sender_id, body)
  values (ticket_record.id, actor_id, btrim(p_message))
  returning * into message_record;

  update public.support_tickets
  set last_message_at = message_record.created_at,
      status = case
        when operator_reply then 'in_progress'::public.support_ticket_status
        else 'open'::public.support_ticket_status
      end,
      assigned_to = case
        when operator_reply then coalesce(assigned_to, actor_id)
        else assigned_to
      end,
      resolved_at = null
  where id = ticket_record.id;

  notification_recipient := case
    when operator_reply then ticket_record.requester_id
    else ticket_record.assigned_to
  end;

  if notification_recipient is not null and notification_recipient <> actor_id then
    insert into public.notifications (
      recipient_id,
      actor_id,
      type,
      entity_type,
      entity_id,
      payload,
      dedupe_key
    ) values (
      notification_recipient,
      actor_id,
      'support_ticket_reply',
      'support_ticket',
      ticket_record.id,
      '{}'::jsonb,
      'support_ticket_reply:' || message_record.id::text
    );
  end if;

  return message_record;
end;
$$;

create or replace function public.claim_support_ticket(p_ticket_id uuid)
returns public.support_tickets
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  ticket_record public.support_tickets;
begin
  if actor_id is null or not private.is_support_operator(actor_id) then
    raise exception 'Support operator access required.' using errcode = '42501';
  end if;

  update public.support_tickets
  set assigned_to = actor_id,
      status = case
        when status = 'resolved' then status
        else 'in_progress'::public.support_ticket_status
      end
  where id = p_ticket_id
  returning * into ticket_record;

  if not found then
    raise exception 'Support ticket not found.' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (actor_id, 'support.ticket_claimed', 'support_ticket', ticket_record.id, '{}'::jsonb);

  return ticket_record;
end;
$$;

create or replace function public.update_support_ticket_state(
  p_ticket_id uuid,
  p_status public.support_ticket_status,
  p_priority public.support_ticket_priority
)
returns public.support_tickets
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  ticket_record public.support_tickets;
begin
  if actor_id is null or not private.is_support_operator(actor_id) then
    raise exception 'Support operator access required.' using errcode = '42501';
  end if;
  if p_ticket_id is null or p_status is null or p_priority is null then
    raise exception 'Ticket, status, and priority are required.' using errcode = '22023';
  end if;

  update public.support_tickets
  set status = p_status,
      priority = p_priority,
      assigned_to = coalesce(assigned_to, actor_id),
      resolved_at = case
        when p_status = 'resolved' then coalesce(resolved_at, timezone('utc', now()))
        else null
      end
  where id = p_ticket_id
  returning * into ticket_record;

  if not found then
    raise exception 'Support ticket not found.' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (
    actor_id,
    'support.ticket_state_changed',
    'support_ticket',
    ticket_record.id,
    jsonb_build_object(
      'status', ticket_record.status::text,
      'priority', ticket_record.priority::text
    )
  );

  insert into public.notifications (
    recipient_id,
    actor_id,
    type,
    entity_type,
    entity_id,
    payload
  ) values (
    ticket_record.requester_id,
    actor_id,
    'support_ticket_updated',
    'support_ticket',
    ticket_record.id,
    jsonb_build_object('status', ticket_record.status::text)
  );

  return ticket_record;
end;
$$;

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;

create policy "Ticket requesters and support operators can read tickets"
on public.support_tickets for select to authenticated
using (
  private.account_access_enabled((select auth.uid()))
  and (
    requester_id = (select auth.uid())
    or private.is_support_operator((select auth.uid()))
  )
);

create policy "Ticket participants and support operators can read messages"
on public.support_ticket_messages for select to authenticated
using (private.can_access_support_ticket(ticket_id, (select auth.uid())));

revoke all on public.support_tickets, public.support_ticket_messages from public, anon, authenticated;
grant select on public.support_tickets, public.support_ticket_messages to authenticated;

revoke all on function private.is_support_operator(uuid) from public, anon;
revoke all on function private.can_access_support_ticket(uuid, uuid) from public, anon;
grant execute on function private.is_support_operator(uuid) to authenticated, service_role;
grant execute on function private.can_access_support_ticket(uuid, uuid) to authenticated, service_role;

revoke all on function public.create_support_ticket(text, public.support_ticket_category, text) from public, anon;
revoke all on function public.reply_support_ticket(uuid, text) from public, anon;
revoke all on function public.claim_support_ticket(uuid) from public, anon;
revoke all on function public.update_support_ticket_state(uuid, public.support_ticket_status, public.support_ticket_priority) from public, anon;
grant execute on function public.create_support_ticket(text, public.support_ticket_category, text) to authenticated;
grant execute on function public.reply_support_ticket(uuid, text) to authenticated;
grant execute on function public.claim_support_ticket(uuid) to authenticated;
grant execute on function public.update_support_ticket_state(uuid, public.support_ticket_status, public.support_ticket_priority) to authenticated;

alter table public.support_tickets replica identity full;
alter table public.support_ticket_messages replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'support_tickets'
  ) then
    alter publication supabase_realtime add table public.support_tickets;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'support_ticket_messages'
  ) then
    alter publication supabase_realtime add table public.support_ticket_messages;
  end if;
end
$$;

comment on table public.support_tickets is
  'Persistent support queue. Requesters read their own tickets; support, admin, and super-admin operate the global queue.';
comment on table public.support_ticket_messages is
  'Private ticket correspondence. Message bodies remain outside notification and audit payloads.';
