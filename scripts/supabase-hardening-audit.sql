-- ORHA pre-validation audit for the NOT VALID constraints introduced by
-- 20260816130000_security_privacy_hardening.sql.
--
-- Prerequisite: migration 20260816130000 must exist in the target transaction/database.
-- This file is read-only and returns one row per constraint. Every violation_count must be 0
-- before 20260816170000 validates the constraints.

begin transaction read only;
set local statement_timeout = '30s';
set local lock_timeout = '3s';

with checks(constraint_name, violation_count) as (
  select
    'profiles_avatar_path_payload_limit',
    count(*) filter (where avatar_path is not null and octet_length(avatar_path) > 1024)
  from public.profiles

  union all
  select
    'profile_details_favorite_season_payload_limit',
    count(*) filter (where favorite_season is not null and char_length(favorite_season) > 80)
  from public.profile_details

  union all
  select
    'profile_details_social_energy_payload_limit',
    count(*) filter (where social_energy is not null and char_length(social_energy) > 80)
  from public.profile_details

  union all
  select 'profile_details_personality_payload_limit', count(*) filter (
    where not public.text_array_payload_is_valid(personality, 5, 80, 1024)
  ) from public.profile_details

  union all
  select 'profile_details_weekend_payload_limit', count(*) filter (
    where not public.text_array_payload_is_valid(weekend_preferences, 8, 120, 2048)
  ) from public.profile_details

  union all
  select 'profile_details_visited_places_payload_limit', count(*) filter (
    where not public.text_array_payload_is_valid(visited_places, 30, 120, 8192)
  ) from public.profile_details

  union all
  select 'profile_details_desired_places_payload_limit', count(*) filter (
    where not public.text_array_payload_is_valid(desired_places, 30, 120, 8192)
  ) from public.profile_details

  union all
  select 'profile_details_interests_payload_limit', count(*) filter (
    where not public.text_array_payload_is_valid(interests, 15, 80, 4096)
  ) from public.profile_details

  union all
  select 'profile_details_hobbies_payload_limit', count(*) filter (
    where not public.text_array_payload_is_valid(hobbies, 15, 80, 4096)
  ) from public.profile_details

  union all
  select 'profile_details_movies_payload_limit', count(*) filter (
    where not public.favorite_payload_is_valid(favorite_movies, 5, 4096, 16384)
  ) from public.profile_details

  union all
  select 'profile_details_series_payload_limit', count(*) filter (
    where not public.favorite_payload_is_valid(favorite_series, 5, 4096, 16384)
  ) from public.profile_details

  union all
  select 'profile_details_songs_payload_limit', count(*) filter (
    where not public.favorite_payload_is_valid(favorite_songs, 5, 4096, 16384)
  ) from public.profile_details

  union all
  select 'profile_details_artists_payload_limit', count(*) filter (
    where not public.favorite_payload_is_valid(favorite_artists, 5, 4096, 16384)
  ) from public.profile_details

  union all
  select 'profile_details_books_payload_limit', count(*) filter (
    where not public.favorite_payload_is_valid(favorite_books, 5, 4096, 16384)
  ) from public.profile_details

  union all
  select 'profile_details_games_payload_limit', count(*) filter (
    where not public.favorite_payload_is_valid(favorite_games, 5, 4096, 16384)
  ) from public.profile_details
)
select
  constraint_name,
  violation_count = 0 as passed,
  violation_count
from checks
order by constraint_name;

commit;
