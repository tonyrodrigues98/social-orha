-- Forward-only hardening for profile privacy and friendship access.
-- Direct table reads are owner-only. Cross-profile reads must use the masked RPC below.

do $$
begin
  create type public.friendship_status as enum ('pending', 'accepted', 'declined');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status public.friendship_status not null default 'pending',
  accepted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint friendships_distinct_people check (requester_id <> addressee_id),
  constraint friendships_acceptance_timestamp check (
    (status = 'accepted' and accepted_at is not null)
    or (status <> 'accepted' and accepted_at is null)
  )
);

create unique index if not exists friendships_unique_pair
on public.friendships (
  least(requester_id, addressee_id),
  greatest(requester_id, addressee_id)
);

create index if not exists friendships_requester_status_idx
on public.friendships (requester_id, status);

create index if not exists friendships_addressee_status_idx
on public.friendships (addressee_id, status);

drop trigger if exists friendships_set_updated_at on public.friendships;
create trigger friendships_set_updated_at
before update on public.friendships
for each row execute function public.set_updated_at();

alter table public.friendships enable row level security;

drop policy if exists "Friendship participants can view the relationship" on public.friendships;
create policy "Friendship participants can view the relationship"
on public.friendships for select
to authenticated
using (
  requester_id = (select auth.uid())
  or addressee_id = (select auth.uid())
);

-- Friendship writes intentionally go through narrow RPCs. There is no follow model.
revoke all on public.friendships from anon, authenticated;
grant select on public.friendships to authenticated;

create or replace function public.request_friendship(target_user_id uuid)
returns public.friendships
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  relationship public.friendships;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if target_user_id is null or target_user_id = actor_id then
    raise exception 'Choose another profile.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = target_user_id
      and onboarding_completed_at is not null
  ) then
    raise exception 'Profile is unavailable.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      least(actor_id, target_user_id)::text || ':' || greatest(actor_id, target_user_id)::text,
      0
    )
  );

  select friendship.*
  into relationship
  from public.friendships as friendship
  where (
    friendship.requester_id = actor_id
    and friendship.addressee_id = target_user_id
  ) or (
    friendship.requester_id = target_user_id
    and friendship.addressee_id = actor_id
  )
  for update;

  if found then
    if relationship.status = 'declined' then
      update public.friendships
      set
        requester_id = actor_id,
        addressee_id = target_user_id,
        status = 'pending',
        accepted_at = null
      where id = relationship.id
      returning * into relationship;
    end if;
    return relationship;
  end if;

  insert into public.friendships (requester_id, addressee_id)
  values (actor_id, target_user_id)
  returning * into relationship;

  return relationship;
end;
$$;

create or replace function public.respond_to_friendship(
  friendship_id uuid,
  accept_request boolean
)
returns public.friendships
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  relationship public.friendships;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if accept_request is null then
    raise exception 'A response is required.' using errcode = '22023';
  end if;

  update public.friendships
  set
    status = case
      when accept_request then 'accepted'::public.friendship_status
      else 'declined'::public.friendship_status
    end,
    accepted_at = case
      when accept_request then timezone('utc', now())
      else null
    end
  where id = friendship_id
    and addressee_id = actor_id
    and status = 'pending'
  returning * into relationship;

  if not found then
    raise exception 'Pending friendship request not found.' using errcode = 'P0002';
  end if;

  return relationship;
end;
$$;

create or replace function public.remove_friendship(friendship_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  delete from public.friendships
  where id = friendship_id
    and (requester_id = actor_id or addressee_id = actor_id);

  if not found then
    raise exception 'Friendship not found.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.request_friendship(uuid) from public, anon;
revoke all on function public.respond_to_friendship(uuid, boolean) from public, anon;
revoke all on function public.remove_friendship(uuid) from public, anon;
grant execute on function public.request_friendship(uuid) to authenticated;
grant execute on function public.respond_to_friendship(uuid, boolean) to authenticated;
grant execute on function public.remove_friendship(uuid) to authenticated;

-- Completed profiles were previously readable as raw rows. Only owners may read raw rows now.
drop policy if exists "Authenticated users can view completed profiles" on public.profiles;
drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
on public.profiles for select
to authenticated
using (id = (select auth.uid()));

drop policy if exists "Authenticated users can view details for completed profiles" on public.profile_details;
drop policy if exists "Users can view their own profile details" on public.profile_details;
create policy "Users can view their own profile details"
on public.profile_details for select
to authenticated
using (profile_id = (select auth.uid()));

-- Remove table-wide UPDATE so browser clients cannot rewrite ids or audit timestamps.
revoke update on public.profiles from authenticated;
revoke update on public.profile_details from authenticated;
revoke update on public.profile_privacy from authenticated;

grant update (
  full_name,
  username,
  birth_date,
  state_code,
  city,
  bio,
  church,
  avatar_path,
  onboarding_step,
  onboarding_completed_at
) on public.profiles to authenticated;

grant update (
  personality,
  favorite_season,
  social_energy,
  weekend_preferences,
  visited_places,
  desired_places,
  interests,
  hobbies,
  favorite_movies,
  favorite_series,
  favorite_songs,
  favorite_artists,
  favorite_books,
  favorite_games
) on public.profile_details to authenticated;

grant update (
  profile_visibility,
  location_visibility,
  favorites_visibility,
  gallery_visibility,
  dating_enabled
) on public.profile_privacy to authenticated;

create or replace function public.text_array_payload_is_valid(
  candidate_values text[],
  maximum_items integer,
  maximum_item_characters integer,
  maximum_bytes integer
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select
    candidate_values is not null
    and cardinality(candidate_values) <= maximum_items
    and octet_length(array_to_string(candidate_values, chr(31))) <= maximum_bytes
    and not exists (
      select 1
      from unnest(candidate_values) as element(value)
      where value is null
        or char_length(btrim(value)) = 0
        or char_length(value) > maximum_item_characters
    );
$$;

create or replace function public.favorite_payload_is_valid(
  candidate jsonb,
  maximum_items integer,
  maximum_item_bytes integer,
  maximum_bytes integer
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select
    candidate is not null
    and jsonb_typeof(candidate) = 'array'
    and jsonb_array_length(candidate) <= maximum_items
    and pg_column_size(candidate) <= maximum_bytes
    and not exists (
      select 1
      from jsonb_array_elements(candidate) as element(value)
      where jsonb_typeof(value) not in ('object', 'string')
        or pg_column_size(value) > maximum_item_bytes
    );
$$;

revoke all on function public.text_array_payload_is_valid(text[], integer, integer, integer) from public, anon;
revoke all on function public.favorite_payload_is_valid(jsonb, integer, integer, integer) from public, anon;
grant execute on function public.text_array_payload_is_valid(text[], integer, integer, integer) to authenticated;
grant execute on function public.favorite_payload_is_valid(jsonb, integer, integer, integer) to authenticated;
grant execute on function public.text_array_payload_is_valid(text[], integer, integer, integer) to service_role;
grant execute on function public.favorite_payload_is_valid(jsonb, integer, integer, integer) to service_role;

-- NOT VALID avoids destroying or silently truncating pre-existing user data. These checks apply
-- immediately to new and changed rows; existing rows can be audited and validated separately.
alter table public.profiles
  add constraint profiles_avatar_path_payload_limit
  check (avatar_path is null or octet_length(avatar_path) <= 1024) not valid;

alter table public.profile_details
  add constraint profile_details_favorite_season_payload_limit
  check (favorite_season is null or char_length(favorite_season) <= 80) not valid,
  add constraint profile_details_social_energy_payload_limit
  check (social_energy is null or char_length(social_energy) <= 80) not valid,
  add constraint profile_details_personality_payload_limit
  check (public.text_array_payload_is_valid(personality, 5, 80, 1024)) not valid,
  add constraint profile_details_weekend_payload_limit
  check (public.text_array_payload_is_valid(weekend_preferences, 8, 120, 2048)) not valid,
  add constraint profile_details_visited_places_payload_limit
  check (public.text_array_payload_is_valid(visited_places, 30, 120, 8192)) not valid,
  add constraint profile_details_desired_places_payload_limit
  check (public.text_array_payload_is_valid(desired_places, 30, 120, 8192)) not valid,
  add constraint profile_details_interests_payload_limit
  check (public.text_array_payload_is_valid(interests, 15, 80, 4096)) not valid,
  add constraint profile_details_hobbies_payload_limit
  check (public.text_array_payload_is_valid(hobbies, 15, 80, 4096)) not valid,
  add constraint profile_details_movies_payload_limit
  check (public.favorite_payload_is_valid(favorite_movies, 5, 4096, 16384)) not valid,
  add constraint profile_details_series_payload_limit
  check (public.favorite_payload_is_valid(favorite_series, 5, 4096, 16384)) not valid,
  add constraint profile_details_songs_payload_limit
  check (public.favorite_payload_is_valid(favorite_songs, 5, 4096, 16384)) not valid,
  add constraint profile_details_artists_payload_limit
  check (public.favorite_payload_is_valid(favorite_artists, 5, 4096, 16384)) not valid,
  add constraint profile_details_books_payload_limit
  check (public.favorite_payload_is_valid(favorite_books, 5, 4096, 16384)) not valid,
  add constraint profile_details_games_payload_limit
  check (public.favorite_payload_is_valid(favorite_games, 5, 4096, 16384)) not valid;

create or replace function public.get_visible_profiles(
  target_profile_id uuid default null,
  page_size integer default 20,
  page_offset integer default 0
)
returns table (
  profile_id uuid,
  full_name text,
  username text,
  bio text,
  church text,
  avatar_path text,
  state_code text,
  city text,
  personality text[],
  favorite_season text,
  social_energy text,
  weekend_preferences text[],
  visited_places text[],
  desired_places text[],
  interests text[],
  hobbies text[],
  favorite_movies jsonb,
  favorite_series jsonb,
  favorite_songs jsonb,
  favorite_artists jsonb,
  favorite_books jsonb,
  favorite_games jsonb,
  can_view_location boolean,
  can_view_favorites boolean,
  can_view_gallery boolean,
  is_friend boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    profile.id,
    profile.full_name,
    profile.username::text,
    profile.bio,
    profile.church,
    profile.avatar_path,
    case when access.can_view_location then profile.state_code else null end,
    case when access.can_view_location then profile.city else null end,
    coalesce(details.personality, '{}'::text[]),
    details.favorite_season,
    details.social_energy,
    coalesce(details.weekend_preferences, '{}'::text[]),
    coalesce(details.visited_places, '{}'::text[]),
    coalesce(details.desired_places, '{}'::text[]),
    coalesce(details.interests, '{}'::text[]),
    coalesce(details.hobbies, '{}'::text[]),
    case when access.can_view_favorites then details.favorite_movies else null end,
    case when access.can_view_favorites then details.favorite_series else null end,
    case when access.can_view_favorites then details.favorite_songs else null end,
    case when access.can_view_favorites then details.favorite_artists else null end,
    case when access.can_view_favorites then details.favorite_books else null end,
    case when access.can_view_favorites then details.favorite_games else null end,
    access.can_view_location,
    access.can_view_favorites,
    access.can_view_gallery,
    access.is_friend
  from public.profiles as profile
  join public.profile_privacy as privacy
    on privacy.profile_id = profile.id
  left join public.profile_details as details
    on details.profile_id = profile.id
  cross join (select auth.uid() as viewer_id) as viewer
  cross join lateral (
    select
      exists (
        select 1
        from public.friendships as friendship
        where friendship.status = 'accepted'
          and (
            (friendship.requester_id = viewer.viewer_id and friendship.addressee_id = profile.id)
            or (friendship.requester_id = profile.id and friendship.addressee_id = viewer.viewer_id)
          )
      ) as is_friend
  ) as friendship_access
  cross join lateral (
    select
      friendship_access.is_friend,
      (
        profile.id = viewer.viewer_id
        or privacy.location_visibility = 'public'
        or (privacy.location_visibility = 'friends' and friendship_access.is_friend)
      ) as can_view_location,
      (
        profile.id = viewer.viewer_id
        or privacy.favorites_visibility = 'public'
        or (privacy.favorites_visibility = 'friends' and friendship_access.is_friend)
      ) as can_view_favorites,
      (
        profile.id = viewer.viewer_id
        or privacy.gallery_visibility = 'public'
        or (privacy.gallery_visibility = 'friends' and friendship_access.is_friend)
      ) as can_view_gallery
  ) as access
  where viewer.viewer_id is not null
    and (target_profile_id is null or profile.id = target_profile_id)
    and (
      profile.id = viewer.viewer_id
      or (
        profile.onboarding_completed_at is not null
        and (
          privacy.profile_visibility = 'public'
          or (privacy.profile_visibility = 'friends' and friendship_access.is_friend)
        )
      )
    )
  order by (profile.id = viewer.viewer_id) desc, profile.full_name nulls last, profile.id
  limit least(greatest(coalesce(page_size, 20), 1), 50)
  offset least(greatest(coalesce(page_offset, 0), 0), 10000);
$$;

revoke all on function public.get_visible_profiles(uuid, integer, integer) from public, anon;
grant execute on function public.get_visible_profiles(uuid, integer, integer) to authenticated;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.validate_profile() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

comment on table public.friendships is 'Accepted profile friendship requests. Conversation requests remain a separate domain; ORHA has no follow model.';
comment on function public.get_visible_profiles(uuid, integer, integer) is 'Privacy-aware profile discovery. Raw profile tables remain owner-only and birth dates are never returned.';
