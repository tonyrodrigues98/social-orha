-- Let a blocker manage their own block list without weakening the raw profiles RLS policy.
-- The projection is deliberately scoped to blocks created by auth.uid(); inverse blocks remain hidden.
create or replace function public.list_own_blocked_profiles(
  p_limit integer default 20,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_blocked_profile_id uuid default null
)
returns table (
  block_id uuid,
  blocked_profile_id uuid,
  full_name text,
  username text,
  avatar_path text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  bounded_limit integer := least(greatest(coalesce(p_limit, 20), 1), 51);
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if not private.account_access_enabled(actor_id) then
    raise exception 'Account access is disabled.' using errcode = '42501';
  end if;

  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'The pagination cursor is incomplete.' using errcode = '22023';
  end if;

  return query
  select
    block.id,
    profile.id,
    profile.full_name,
    profile.username::text,
    profile.avatar_path,
    block.created_at
  from public.blocks as block
  join public.profiles as profile on profile.id = block.blocked_id
  where block.blocker_id = actor_id
    and (p_blocked_profile_id is null or block.blocked_id = p_blocked_profile_id)
    and (
      p_before_created_at is null
      or (block.created_at, block.id) < (p_before_created_at, p_before_id)
    )
  order by block.created_at desc, block.id desc
  limit bounded_limit;
end;
$$;

comment on function public.list_own_blocked_profiles(integer,timestamptz,uuid,uuid) is
  'Returns only the caller-owned block list with the minimum profile identity needed to manage it.';

revoke all on function public.list_own_blocked_profiles(integer,timestamptz,uuid,uuid)
  from public, anon;
grant execute on function public.list_own_blocked_profiles(integer,timestamptz,uuid,uuid)
  to authenticated;

do $$
begin
  if to_regprocedure('public.list_own_blocked_profiles(integer,timestamptz,uuid,uuid)') is null then
    raise exception 'list_own_blocked_profiles was not created';
  end if;
  if has_function_privilege(
    'anon',
    'public.list_own_blocked_profiles(integer,timestamptz,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'anon must not execute list_own_blocked_profiles';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.list_own_blocked_profiles(integer,timestamptz,uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must execute list_own_blocked_profiles';
  end if;
end;
$$;
