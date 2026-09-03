-- ORHA group conversation lifecycle: leave, ownership transfer, and close.

alter table public.conversations
  add column closed_at timestamptz,
  add column closed_by uuid references public.profiles(id) on delete set null;

create index conversations_open_group_idx
on public.conversations (updated_at desc, id)
where kind = 'group' and closed_at is null;

create function public.leave_group_conversation(p_conversation_id uuid)
returns public.conversation_members
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  membership public.conversation_members;
begin
  if not private.account_access_enabled(actor_id) then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select member.* into membership
  from public.conversation_members as member
  join public.conversations as conversation on conversation.id = member.conversation_id
  where member.conversation_id = p_conversation_id
    and member.profile_id = actor_id
    and member.status = 'active'
    and conversation.kind = 'group'
    and conversation.closed_at is null
  for update of member;

  if not found then
    raise exception 'Active group membership not found.' using errcode = 'P0002';
  end if;
  if membership.role = 'owner' then
    raise exception 'Transfer ownership or close the group before leaving.' using errcode = '23514';
  end if;

  update public.conversation_members
  set status = 'left', joined_at = null
  where conversation_id = p_conversation_id and profile_id = actor_id
  returning * into membership;

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (actor_id, 'conversation.group_left', 'conversation', p_conversation_id, '{}'::jsonb);
  return membership;
end;
$$;

create function public.transfer_group_ownership(p_conversation_id uuid, p_new_owner_id uuid)
returns public.conversation_members
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target public.conversation_members;
begin
  if not private.can_manage_group(p_conversation_id, actor_id, true)
    or p_new_owner_id is null
    or p_new_owner_id = actor_id then
    raise exception 'Group owner permission and another member are required.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_conversation_id::text || ':owner', 0));
  if exists (
    select 1 from public.conversations
    where id = p_conversation_id and closed_at is not null
  ) then
    raise exception 'Closed groups cannot change ownership.' using errcode = '23514';
  end if;

  select * into target
  from public.conversation_members
  where conversation_id = p_conversation_id
    and profile_id = p_new_owner_id
    and status = 'active'
    and role <> 'owner'
  for update;
  if not found then
    raise exception 'Choose an active group member.' using errcode = 'P0002';
  end if;

  update public.conversation_members
  set role = 'member'
  where conversation_id = p_conversation_id and profile_id = actor_id and role = 'owner';

  update public.conversation_members
  set role = 'owner'
  where conversation_id = p_conversation_id and profile_id = p_new_owner_id
  returning * into target;

  update public.conversations
  set created_by = p_new_owner_id, updated_at = timezone('utc', now())
  where id = p_conversation_id;

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (
    actor_id,
    'conversation.group_ownership_transferred',
    'conversation',
    p_conversation_id,
    jsonb_build_object('new_owner_id', p_new_owner_id)
  );
  return target;
end;
$$;

create function public.close_group_conversation(p_conversation_id uuid)
returns public.conversations
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  conversation_record public.conversations;
begin
  if not private.can_manage_group(p_conversation_id, actor_id, true) then
    raise exception 'Only the active group owner can close the group.' using errcode = '42501';
  end if;

  select * into conversation_record
  from public.conversations
  where id = p_conversation_id and kind = 'group' and closed_at is null
  for update;
  if not found then
    raise exception 'Open group conversation not found.' using errcode = 'P0002';
  end if;

  update public.conversations
  set closed_at = timezone('utc', now()), closed_by = actor_id, updated_at = timezone('utc', now())
  where id = p_conversation_id
  returning * into conversation_record;

  update public.conversation_members
  set status = 'left', joined_at = null
  where conversation_id = p_conversation_id and status in ('active', 'invited');

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (actor_id, 'conversation.group_closed', 'conversation', p_conversation_id, '{}'::jsonb);
  return conversation_record;
end;
$$;

revoke all on function public.leave_group_conversation(uuid) from public, anon;
revoke all on function public.transfer_group_ownership(uuid, uuid) from public, anon;
revoke all on function public.close_group_conversation(uuid) from public, anon;
grant execute on function public.leave_group_conversation(uuid) to authenticated, service_role;
grant execute on function public.transfer_group_ownership(uuid, uuid) to authenticated, service_role;
grant execute on function public.close_group_conversation(uuid) to authenticated, service_role;
