-- Resolve PL/pgSQL variable/column ambiguity found by the hosted database lint.

create or replace function private.ensure_direct_conversation(
  p_first uuid,
  p_second uuid,
  p_created_by uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  low_id uuid := least(p_first, p_second);
  high_id uuid := greatest(p_first, p_second);
  v_conversation_id uuid;
begin
  insert into public.conversations (kind, created_by, direct_user_low, direct_user_high)
  values ('direct', p_created_by, low_id, high_id)
  on conflict (direct_user_low, direct_user_high) where kind = 'direct'
  do update set updated_at = timezone('utc', now())
  returning id into v_conversation_id;

  insert into public.conversation_members (conversation_id, profile_id, role, status, joined_at)
  values
    (v_conversation_id, low_id, 'member', 'active', timezone('utc', now())),
    (v_conversation_id, high_id, 'member', 'active', timezone('utc', now()))
  on conflict (conversation_id, profile_id) do update
    set status = 'active',
        joined_at = coalesce(public.conversation_members.joined_at, timezone('utc', now()));

  insert into public.conversation_preferences (conversation_id, profile_id)
  values (v_conversation_id, low_id), (v_conversation_id, high_id)
  on conflict (conversation_id, profile_id) do nothing;

  return v_conversation_id;
end;
$$;

create or replace function public.mark_notifications_read(p_notification_ids uuid[] default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  affected integer;
begin
  if v_actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_notification_ids is not null and cardinality(p_notification_ids) > 100 then
    raise exception 'At most one hundred notifications can be updated at once.' using errcode = '22023';
  end if;

  update public.notifications as notification
  set read_at = timezone('utc', now())
  where notification.recipient_id = v_actor_id
    and notification.read_at is null
    and (p_notification_ids is null or notification.id = any(p_notification_ids));

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function private.ensure_direct_conversation(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
