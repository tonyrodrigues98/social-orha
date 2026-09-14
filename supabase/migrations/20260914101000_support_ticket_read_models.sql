-- Privacy-safe, cursor-paginated read models for the support UI.

create or replace function public.list_support_tickets(
  p_status public.support_ticket_status default null,
  p_limit integer default 30,
  p_before_activity timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid,
  requester_id uuid,
  requester_full_name text,
  requester_avatar_path text,
  subject text,
  category public.support_ticket_category,
  status public.support_ticket_status,
  priority public.support_ticket_priority,
  assigned_to uuid,
  assignee_full_name text,
  last_message_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  page_size integer := least(greatest(coalesce(p_limit, 30), 1), 50);
begin
  if actor_id is null or not private.account_access_enabled(actor_id) then
    raise exception 'An active authenticated account is required.' using errcode = '42501';
  end if;
  if (p_before_activity is null) <> (p_before_id is null) then
    raise exception 'Both support ticket cursor fields are required together.' using errcode = '22023';
  end if;

  return query
  select
    ticket.id,
    ticket.requester_id,
    requester.full_name,
    requester.avatar_path,
    ticket.subject,
    ticket.category,
    ticket.status,
    ticket.priority,
    ticket.assigned_to,
    assignee.full_name,
    ticket.last_message_at,
    ticket.resolved_at,
    ticket.created_at,
    ticket.updated_at
  from public.support_tickets as ticket
  join public.profiles as requester on requester.id = ticket.requester_id
  left join public.profiles as assignee on assignee.id = ticket.assigned_to
  where (ticket.requester_id = actor_id or private.is_support_operator(actor_id))
    and (p_status is null or ticket.status = p_status)
    and (
      p_before_activity is null
      or (ticket.last_message_at, ticket.id) < (p_before_activity, p_before_id)
    )
  order by ticket.last_message_at desc, ticket.id desc
  limit page_size + 1;
end;
$$;

create or replace function public.list_support_ticket_messages(
  p_ticket_id uuid,
  p_limit integer default 50,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns table (
  id uuid,
  ticket_id uuid,
  sender_id uuid,
  sender_name text,
  sender_avatar_path text,
  body text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  page_size integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if actor_id is null
    or not private.can_access_support_ticket(p_ticket_id, actor_id) then
    raise exception 'Support ticket access denied.' using errcode = '42501';
  end if;
  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'Both support message cursor fields are required together.' using errcode = '22023';
  end if;

  return query
  select
    message.id,
    message.ticket_id,
    message.sender_id,
    coalesce(sender.full_name, 'Membro ORHA'),
    sender.avatar_path,
    message.body,
    message.created_at
  from public.support_ticket_messages as message
  join public.profiles as sender on sender.id = message.sender_id
  where message.ticket_id = p_ticket_id
    and (
      p_before_created_at is null
      or (message.created_at, message.id) < (p_before_created_at, p_before_id)
    )
  order by message.created_at desc, message.id desc
  limit page_size + 1;
end;
$$;

revoke all on function public.list_support_tickets(public.support_ticket_status, integer, timestamptz, uuid) from public, anon;
revoke all on function public.list_support_ticket_messages(uuid, integer, timestamptz, uuid) from public, anon;
grant execute on function public.list_support_tickets(public.support_ticket_status, integer, timestamptz, uuid) to authenticated;
grant execute on function public.list_support_ticket_messages(uuid, integer, timestamptz, uuid) to authenticated;

comment on function public.list_support_tickets(public.support_ticket_status, integer, timestamptz, uuid) is
  'Cursor-paginated support read model. Users see their own tickets; authorized operators see the queue.';
comment on function public.list_support_ticket_messages(uuid, integer, timestamptz, uuid) is
  'Cursor-paginated support message read model with participant display data.';
