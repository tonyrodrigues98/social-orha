-- Preserve the public text contract while profiles.username is stored as citext.

create or replace function public.list_global_role_assignments(
  p_query text default null,
  p_limit integer default 30,
  p_before_updated_at timestamptz default null,
  p_before_user_id uuid default null
)
returns table (
  user_id uuid,
  full_name text,
  username text,
  role public.app_role,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_query text := nullif(lower(btrim(coalesce(p_query, ''))), '');
  safe_limit integer := least(greatest(coalesce(p_limit, 30), 1), 50);
begin
  if not private.is_global_role_manager(actor_id) then
    raise exception 'Only active global role managers can list assignments.' using errcode = '42501';
  end if;

  if normalized_query is not null and char_length(normalized_query) < 2 then
    raise exception 'Search with at least two characters.' using errcode = '22023';
  end if;

  if normalized_query is not null and char_length(normalized_query) > 64 then
    raise exception 'Search is too long.' using errcode = '22023';
  end if;

  if (p_before_updated_at is null) <> (p_before_user_id is null) then
    raise exception 'The role cursor is incomplete.' using errcode = '22023';
  end if;

  return query
  select
    role_row.user_id,
    profile.full_name,
    profile.username::text,
    role_row.role,
    role_row.updated_at
  from public.user_roles as role_row
  join public.profiles as profile on profile.id = role_row.user_id
  where profile.onboarding_completed_at is not null
    and (
      normalized_query is not null
      or role_row.role <> 'user'::public.app_role
    )
    and (
      normalized_query is null
      or lower(coalesce(profile.username, '')) like '%' || normalized_query || '%'
      or lower(coalesce(profile.full_name, '')) like '%' || normalized_query || '%'
    )
    and (
      p_before_updated_at is null
      or (role_row.updated_at, role_row.user_id) < (p_before_updated_at, p_before_user_id)
    )
  order by role_row.updated_at desc, role_row.user_id desc
  limit safe_limit;
end;
$$;

create or replace function public.assign_global_role(
  p_target_user_id uuid,
  p_role public.app_role,
  p_reason text
)
returns table (
  user_id uuid,
  full_name text,
  username text,
  role public.app_role,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role;
  previous_role public.app_role;
  normalized_reason text := btrim(coalesce(p_reason, ''));
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if not private.is_global_role_manager(actor_id) then
    raise exception 'Only active global role managers can change assignments.' using errcode = '42501';
  end if;

  if p_target_user_id is null or p_role is null then
    raise exception 'Choose a target account and role.' using errcode = '22023';
  end if;

  if p_target_user_id = actor_id then
    raise exception 'Role managers cannot change their own role.' using errcode = '42501';
  end if;

  if char_length(normalized_reason) < 12 or char_length(normalized_reason) > 500 then
    raise exception 'Give an operational reason between 12 and 500 characters.' using errcode = '22023';
  end if;

  select role_row.role
  into actor_role
  from public.user_roles as role_row
  where role_row.user_id = actor_id;

  select role_row.role
  into previous_role
  from public.user_roles as role_row
  join public.profiles as profile on profile.id = role_row.user_id
  where role_row.user_id = p_target_user_id
    and profile.onboarding_completed_at is not null
  for update of role_row;

  if previous_role is null then
    raise exception 'The target account is not available for role assignment.' using errcode = 'P0002';
  end if;

  if previous_role = p_role then
    raise exception 'The target account already has this role.' using errcode = '23505';
  end if;

  if actor_role = 'admin'::public.app_role and (
    previous_role not in ('user', 'support', 'moderator')
    or p_role not in ('user', 'support', 'moderator')
  ) then
    raise exception 'Admins can manage only user, support and moderator assignments.' using errcode = '42501';
  end if;

  if previous_role = 'super_admin'::public.app_role
    and p_role <> 'super_admin'::public.app_role
    and (
      select count(*)
      from public.user_roles as role_row
      where role_row.role = 'super_admin'::public.app_role
    ) <= 1 then
    raise exception 'The last SuperAdmin cannot be removed.' using errcode = '42501';
  end if;

  perform private.consume_actor_rate_limits(actor_id, 'global_role_change');

  update public.user_roles as role_row
  set role = p_role,
      updated_at = timezone('utc', now())
  where role_row.user_id = p_target_user_id;

  insert into public.audit_logs (
    actor_id,
    event_type,
    target_type,
    target_id,
    metadata
  )
  values (
    actor_id,
    'identity.global_role_changed',
    'profile',
    p_target_user_id,
    jsonb_build_object(
      'previous_role', previous_role::text,
      'new_role', p_role::text,
      'reason', normalized_reason
    )
  );

  insert into public.notifications (
    recipient_id,
    actor_id,
    type,
    entity_type,
    entity_id,
    payload
  )
  values (
    p_target_user_id,
    actor_id,
    'account_role_changed',
    'profile',
    p_target_user_id,
    jsonb_build_object('role', p_role::text)
  );

  return query
  select
    role_row.user_id,
    profile.full_name,
    profile.username::text,
    role_row.role,
    role_row.updated_at
  from public.user_roles as role_row
  join public.profiles as profile on profile.id = role_row.user_id
  where role_row.user_id = p_target_user_id;
end;
$$;

revoke all on function public.list_global_role_assignments(text, integer, timestamptz, uuid) from public, anon;
revoke all on function public.assign_global_role(uuid, public.app_role, text) from public, anon;
grant execute on function public.list_global_role_assignments(text, integer, timestamptz, uuid) to authenticated;
grant execute on function public.assign_global_role(uuid, public.app_role, text) to authenticated;
