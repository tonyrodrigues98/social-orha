-- Editable profile details and privacy-safe age projection.
-- Forward-only: extends the launch schema without rewriting migration 170000.

do $$
begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.profile_details') is null
    or to_regclass('public.profile_privacy') is null
    or to_regtype('public.profile_visibility') is null
    or to_regprocedure('private.account_access_enabled(uuid)') is null
    or to_regprocedure('private.effective_profile_account_status(uuid)') is null
    or to_regprocedure('private.is_socially_active(uuid)') is null
    or to_regprocedure('private.can_view_profile(uuid,uuid)') is null
    or to_regprocedure('private.are_friends(uuid,uuid)') is null
    or to_regprocedure('private.is_blocked_between(uuid,uuid)') is null then
    raise exception 'ORHA social launch schema must be applied before profile details and age privacy.' using errcode = '55000';
  end if;
end
$$;

alter table public.profile_privacy
  add column if not exists age_visibility public.profile_visibility not null default 'private';

comment on column public.profile_privacy.age_visibility is
  'Controls disclosure of server-derived age. The browser never receives another profile birth_date.';

-- Only this privacy column is added to the browser update grant; raw identifiers and
-- audit columns stay non-writable. Owner RLS is tightened below for moderated accounts.
grant update (age_visibility) on public.profile_privacy to authenticated;

-- Profile mutations remain available during onboarding for active accounts, but a
-- moderation restriction freezes identity, enrichment, favorites and privacy edits.
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles for update to authenticated
using (
  id = (select auth.uid())
  and private.account_access_enabled((select auth.uid()))
  and private.effective_profile_account_status((select auth.uid())) = 'active'
)
with check (
  id = (select auth.uid())
  and private.account_access_enabled((select auth.uid()))
  and private.effective_profile_account_status((select auth.uid())) = 'active'
);

drop policy if exists "Users can update their own profile details" on public.profile_details;
create policy "Users can update their own profile details"
on public.profile_details for update to authenticated
using (
  profile_id = (select auth.uid())
  and private.account_access_enabled((select auth.uid()))
  and private.effective_profile_account_status((select auth.uid())) = 'active'
)
with check (
  profile_id = (select auth.uid())
  and private.account_access_enabled((select auth.uid()))
  and private.effective_profile_account_status((select auth.uid())) = 'active'
);

drop policy if exists "Users can update their own privacy settings" on public.profile_privacy;
create policy "Users can update their own privacy settings"
on public.profile_privacy for update to authenticated
using (
  profile_id = (select auth.uid())
  and private.account_access_enabled((select auth.uid()))
  and private.effective_profile_account_status((select auth.uid())) = 'active'
)
with check (
  profile_id = (select auth.uid())
  and private.account_access_enabled((select auth.uid()))
  and private.effective_profile_account_status((select auth.uid())) = 'active'
);

-- Profile enrichment is written through the allowlisted RPC below. Favorites retain
-- their dedicated column adapter and grants from the launch schema.
revoke update (
  personality,
  favorite_season,
  social_energy,
  weekend_preferences,
  visited_places,
  desired_places,
  interests,
  hobbies
) on public.profile_details from authenticated;

create or replace function private.normalize_profile_detail_text_array(p_value jsonb)
returns text[]
language sql
immutable
parallel safe
security invoker
set search_path = ''
as $$
  select coalesce(array_agg(item.value order by item.first_ordinal), '{}'::text[])
  from (
    select
      btrim(element.value #>> '{}') as value,
      min(element.ordinality) as first_ordinal
    from jsonb_array_elements(p_value) with ordinality as element(value, ordinality)
    where jsonb_typeof(element.value) = 'string'
      and btrim(element.value #>> '{}') <> ''
    group by btrim(element.value #>> '{}')
  ) as item;
$$;

revoke all on function private.normalize_profile_detail_text_array(jsonb)
from public, anon, authenticated;

create or replace function public.update_own_profile_details(p_patch jsonb)
returns public.profile_details
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  field_name text;
  details public.profile_details%rowtype;
  next_personality text[];
  next_favorite_season text;
  next_social_energy text;
  next_weekend_preferences text[];
  next_visited_places text[];
  next_desired_places text[];
  next_interests text[];
  next_hobbies text[];
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if not private.account_access_enabled(actor_id) then
    raise exception 'Account access is disabled.' using errcode = '42501';
  end if;
  if private.effective_profile_account_status(actor_id) <> 'active' then
    raise exception 'Account is not allowed to update profile details.' using errcode = '42501';
  end if;
  if p_patch is null
    or jsonb_typeof(p_patch) <> 'object'
    or p_patch = '{}'::jsonb then
    raise exception 'Profile details patch must be a non-empty object.' using errcode = '22023';
  end if;
  if octet_length(p_patch::text) > 16384 then
    raise exception 'Profile details patch exceeds 16 KiB.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_object_keys(p_patch) as supplied(key)
    where supplied.key not in (
      'personality',
      'favorite_season',
      'social_energy',
      'weekend_preferences',
      'visited_places',
      'desired_places',
      'interests',
      'hobbies'
    )
  ) then
    raise exception 'Profile details patch contains unsupported fields.' using errcode = '22023';
  end if;

  foreach field_name in array array[
    'personality',
    'weekend_preferences',
    'visited_places',
    'desired_places',
    'interests',
    'hobbies'
  ]
  loop
    if p_patch ? field_name then
      if jsonb_typeof(p_patch -> field_name) <> 'array'
        or exists (
          select 1
          from jsonb_array_elements(p_patch -> field_name) as element(value)
          where jsonb_typeof(element.value) <> 'string'
        ) then
        raise exception 'Profile detail % must be an array of strings.', field_name using errcode = '22023';
      end if;
    end if;
  end loop;

  foreach field_name in array array['favorite_season', 'social_energy']
  loop
    if p_patch ? field_name
      and jsonb_typeof(p_patch -> field_name) not in ('string', 'null') then
      raise exception 'Profile detail % must be a string or null.', field_name using errcode = '22023';
    end if;
  end loop;

  select * into details
  from public.profile_details
  where profile_id = actor_id
  for update;

  if not found then
    raise exception 'Profile details not found.' using errcode = 'P0002';
  end if;

  next_personality := case when p_patch ? 'personality'
    then private.normalize_profile_detail_text_array(p_patch -> 'personality')
    else details.personality end;
  next_favorite_season := case when p_patch ? 'favorite_season'
    then nullif(btrim(p_patch ->> 'favorite_season'), '')
    else details.favorite_season end;
  next_social_energy := case when p_patch ? 'social_energy'
    then nullif(btrim(p_patch ->> 'social_energy'), '')
    else details.social_energy end;
  next_weekend_preferences := case when p_patch ? 'weekend_preferences'
    then private.normalize_profile_detail_text_array(p_patch -> 'weekend_preferences')
    else details.weekend_preferences end;
  next_visited_places := case when p_patch ? 'visited_places'
    then private.normalize_profile_detail_text_array(p_patch -> 'visited_places')
    else details.visited_places end;
  next_desired_places := case when p_patch ? 'desired_places'
    then private.normalize_profile_detail_text_array(p_patch -> 'desired_places')
    else details.desired_places end;
  next_interests := case when p_patch ? 'interests'
    then private.normalize_profile_detail_text_array(p_patch -> 'interests')
    else details.interests end;
  next_hobbies := case when p_patch ? 'hobbies'
    then private.normalize_profile_detail_text_array(p_patch -> 'hobbies')
    else details.hobbies end;

  if not public.text_array_payload_is_valid(next_personality, 5, 80, 1024)
    or not public.text_array_payload_is_valid(next_weekend_preferences, 8, 120, 2048)
    or not public.text_array_payload_is_valid(next_visited_places, 30, 120, 8192)
    or not public.text_array_payload_is_valid(next_desired_places, 30, 120, 8192)
    or not public.text_array_payload_is_valid(next_interests, 15, 80, 4096)
    or not public.text_array_payload_is_valid(next_hobbies, 15, 80, 4096)
    or (next_favorite_season is not null and char_length(next_favorite_season) > 80)
    or (next_social_energy is not null and char_length(next_social_energy) > 80) then
    raise exception 'Profile details exceed the server limits.' using errcode = '22023';
  end if;

  update public.profile_details
  set personality = next_personality,
      favorite_season = next_favorite_season,
      social_energy = next_social_energy,
      weekend_preferences = next_weekend_preferences,
      visited_places = next_visited_places,
      desired_places = next_desired_places,
      interests = next_interests,
      hobbies = next_hobbies
  where profile_id = actor_id
  returning * into details;

  return details;
end;
$$;

revoke all on function public.update_own_profile_details(jsonb) from public, anon;
grant execute on function public.update_own_profile_details(jsonb) to authenticated;

-- Age is deliberately a separate privacy-aware projection. Its return type has no
-- birth_date column, so the raw date cannot cross the public profile boundary.
create or replace function public.get_visible_profile_age(p_profile_id uuid)
returns table (
  profile_id uuid,
  age_years smallint,
  can_view_age boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select auth.uid() as viewer_id
  )
  select
    profile.id,
    case
      when access.can_view_age and profile.birth_date is not null
        then extract(year from age(current_date, profile.birth_date))::smallint
      else null
    end as age_years,
    access.can_view_age
  from public.profiles as profile
  join public.profile_privacy as privacy on privacy.profile_id = profile.id
  cross join viewer
  cross join lateral (
    select private.are_friends(profile.id, viewer.viewer_id) as is_friend
  ) as friendship
  cross join lateral (
    select (
      profile.id = viewer.viewer_id
      or privacy.age_visibility = 'public'
      or (privacy.age_visibility = 'friends' and friendship.is_friend)
    ) as can_view_age
  ) as access
  where profile.id = p_profile_id
    and viewer.viewer_id is not null
    and private.account_access_enabled(viewer.viewer_id)
    and private.effective_profile_account_status(viewer.viewer_id) = 'active'
    and (
      profile.id = viewer.viewer_id
      or (
        private.is_socially_active(viewer.viewer_id)
        and private.is_socially_active(profile.id)
        and private.can_view_profile(profile.id, viewer.viewer_id)
      )
    );
$$;

revoke all on function public.get_visible_profile_age(uuid) from public, anon;
grant execute on function public.get_visible_profile_age(uuid) to authenticated;
