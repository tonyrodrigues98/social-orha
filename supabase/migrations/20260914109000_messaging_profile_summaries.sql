begin;

do $$
begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.conversation_requests') is null
    or to_regclass('public.conversation_members') is null
    or to_regprocedure('private.account_access_enabled(uuid)') is null
    or to_regprocedure('private.effective_profile_account_status(uuid)') is null
    or to_regprocedure('private.is_blocked_between(uuid,uuid)') is null then
    raise exception 'Messaging profile summary prerequisites are missing.';
  end if;
end;
$$;

create or replace function public.get_messaging_profile_summaries(p_profile_ids uuid[])
returns table (
  profile_id uuid,
  full_name text,
  username text,
  avatar_path text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  requested_ids uuid[] := coalesce(p_profile_ids, '{}'::uuid[]);
begin
  if actor_id is null or not private.account_access_enabled(actor_id) then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if cardinality(requested_ids) > 100 then
    raise exception 'At most 100 profile summaries may be requested.' using errcode = '22023';
  end if;

  return query
  select
    profile.id,
    profile.full_name,
    profile.username::text,
    profile.avatar_path
  from public.profiles as profile
  where profile.id = any(requested_ids)
    and profile.onboarding_completed_at is not null
    and private.effective_profile_account_status(profile.id) = 'active'
    and not private.is_blocked_between(actor_id, profile.id)
    and (
      profile.id = actor_id
      or exists (
        select 1
        from public.conversation_requests as request
        where request.status in ('pending', 'accepted')
          and (
            (request.requester_id = actor_id and request.recipient_id = profile.id)
            or (request.recipient_id = actor_id and request.requester_id = profile.id)
          )
      )
      or exists (
        select 1
        from public.conversation_members as viewer_membership
        join public.conversation_members as target_membership
          on target_membership.conversation_id = viewer_membership.conversation_id
        where viewer_membership.profile_id = actor_id
          and viewer_membership.status in ('active', 'invited')
          and target_membership.profile_id = profile.id
          and target_membership.status in ('active', 'invited')
      )
    )
  order by profile.id;
end;
$$;

revoke all on function public.get_messaging_profile_summaries(uuid[]) from public, anon;
grant execute on function public.get_messaging_profile_summaries(uuid[]) to authenticated;

do $$
begin
  if to_regprocedure('public.get_messaging_profile_summaries(uuid[])') is null then
    raise exception 'Messaging profile summary RPC was not installed.';
  end if;

  if has_function_privilege('anon', 'public.get_messaging_profile_summaries(uuid[])', 'EXECUTE') then
    raise exception 'Anonymous role must not execute messaging profile summaries.';
  end if;

  if not has_function_privilege('authenticated', 'public.get_messaging_profile_summaries(uuid[])', 'EXECUTE') then
    raise exception 'Authenticated role cannot execute messaging profile summaries.';
  end if;
end;
$$;

commit;
