-- Route message reactions through one actor-authoritative contract. Direct table
-- mutations made browser upserts depend on several RLS branches at once and
-- allowed the caller to supply reactor_id. The RPC derives the actor from Auth.

do $$
begin
  if to_regclass('public.messages') is null
    or to_regclass('public.message_reactions') is null
    or to_regclass('public.conversations') is null
    or to_regprocedure('private.can_view_message(uuid,uuid)') is null
    or to_regprocedure('private.is_blocked_between(uuid,uuid)') is null
  then
    raise exception 'Authoritative messaging prerequisites are missing.' using errcode = '55000';
  end if;
end;
$$;

create or replace function public.set_message_reaction(
  p_message_id uuid,
  p_kind public.reaction_kind,
  p_active boolean
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  message_record public.messages;
  conversation_record public.conversations;
begin
  if actor_id is null
    or not private.account_access_enabled(actor_id)
    or not private.is_socially_active(actor_id)
  then
    raise exception 'Message reaction is not available.' using errcode = '42501';
  end if;

  if p_active is null or (p_active and p_kind is null) then
    raise exception 'Invalid message reaction.' using errcode = '22023';
  end if;

  select message.*
  into message_record
  from public.messages as message
  where message.id = p_message_id;

  if not found
    or message_record.deleted_at is not null
    or not private.can_view_message(message_record.id, actor_id)
  then
    raise exception 'Message reaction is not available.' using errcode = '42501';
  end if;

  select conversation.*
  into conversation_record
  from public.conversations as conversation
  where conversation.id = message_record.conversation_id;

  if not found then
    raise exception 'Message reaction is not available.' using errcode = '42501';
  end if;

  if conversation_record.kind = 'direct'::public.conversation_kind
    and private.is_blocked_between(
      conversation_record.direct_user_low,
      conversation_record.direct_user_high
    )
  then
    raise exception 'Message reaction is not available.' using errcode = '42501';
  end if;

  if p_active then
    insert into public.message_reactions (message_id, reactor_id, kind)
    values (message_record.id, actor_id, p_kind)
    on conflict (message_id, reactor_id)
    do update set kind = excluded.kind;
    return true;
  end if;

  delete from public.message_reactions
  where message_id = message_record.id
    and reactor_id = actor_id;
  return false;
end;
$$;

revoke all on function public.set_message_reaction(uuid, public.reaction_kind, boolean)
from public, anon, authenticated;
grant execute on function public.set_message_reaction(uuid, public.reaction_kind, boolean)
to authenticated, service_role;

-- Reactions remain readable through RLS/Realtime, but browser writes now have a
-- single server-authoritative entry point and cannot forge reactor_id.
revoke insert, update, delete on public.message_reactions from authenticated;

comment on function public.set_message_reaction(uuid, public.reaction_kind, boolean) is
  'Adds, changes, or removes the authenticated participant reaction after message, membership, account, clear-watermark, and direct-block checks.';

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'public.set_message_reaction(uuid,public.reaction_kind,boolean)'::regprocedure
  ) into function_definition;

  if function_definition is null
    or position('security definer' in lower(function_definition)) = 0
    or position('set search_path to' in lower(function_definition)) = 0
    or position('auth.uid()' in lower(function_definition)) = 0
    or position('private.can_view_message' in lower(function_definition)) = 0
    or position('private.is_blocked_between' in lower(function_definition)) = 0
    or position('on conflict' in lower(function_definition)) = 0
  then
    raise exception 'set_message_reaction is missing an authorization invariant.' using errcode = '55000';
  end if;

  if not has_function_privilege(
      'authenticated',
      'public.set_message_reaction(uuid,public.reaction_kind,boolean)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.set_message_reaction(uuid,public.reaction_kind,boolean)',
      'EXECUTE'
    )
  then
    raise exception 'set_message_reaction grants are invalid.' using errcode = '55000';
  end if;

  if not has_table_privilege('authenticated', 'public.message_reactions', 'SELECT')
    or has_table_privilege('authenticated', 'public.message_reactions', 'INSERT')
    or has_table_privilege('authenticated', 'public.message_reactions', 'UPDATE')
    or has_table_privilege('authenticated', 'public.message_reactions', 'DELETE')
  then
    raise exception 'message_reactions browser grants are not read-only.' using errcode = '55000';
  end if;
end;
$$;
