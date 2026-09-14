-- Make onboarding completion a server-authoritative, idempotent transition.
-- Required profile fields are persisted step-by-step, then this RPC validates
-- the final row and derives the completion timestamp inside one transaction.

revoke update (onboarding_completed_at) on public.profiles from authenticated;

create or replace function public.complete_own_onboarding()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  current_profile public.profiles%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if not private.account_access_enabled(actor_id) then
    raise exception 'This account cannot complete onboarding.' using errcode = '42501';
  end if;

  select profile.*
  into current_profile
  from public.profiles as profile
  where profile.id = actor_id
  for update;

  if not found then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;

  if current_profile.full_name is null
    or char_length(btrim(current_profile.full_name)) < 2
    or current_profile.username is null
    or current_profile.username::text !~ '^[a-z0-9._]{3,30}$'
    or current_profile.birth_date is null
    or current_profile.birth_date > current_date - interval '18 years'
    or current_profile.state_code is null
    or current_profile.state_code <> all (
      array[
        'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
        'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
        'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
      ]::text[]
    )
    or current_profile.city is null
    or char_length(btrim(current_profile.city)) < 2
    or current_profile.bio is null
    or char_length(btrim(current_profile.bio)) = 0
  then
    raise exception 'Required onboarding data is incomplete or invalid.'
      using errcode = '22023';
  end if;

  update public.profiles as profile
  set onboarding_step = 6,
      onboarding_completed_at = coalesce(
        profile.onboarding_completed_at,
        timezone('utc', now())
      )
  where profile.id = actor_id
  returning profile.* into current_profile;

  return current_profile;
end;
$$;

revoke all on function public.complete_own_onboarding() from public, anon;
grant execute on function public.complete_own_onboarding() to authenticated;

comment on function public.complete_own_onboarding() is
  'Validates the authenticated profile and atomically completes onboarding with a server-derived timestamp.';

do $$
begin
  if has_column_privilege('authenticated', 'public.profiles', 'onboarding_completed_at', 'UPDATE') then
    raise exception 'authenticated must not update onboarding_completed_at directly';
  end if;

  if not has_function_privilege('authenticated', 'public.complete_own_onboarding()', 'EXECUTE') then
    raise exception 'authenticated must execute complete_own_onboarding';
  end if;

  if has_function_privilege('anon', 'public.complete_own_onboarding()', 'EXECUTE') then
    raise exception 'anon must not execute complete_own_onboarding';
  end if;
end
$$;
