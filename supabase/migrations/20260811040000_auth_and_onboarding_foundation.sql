create extension if not exists citext with schema extensions;

do $$
begin
  create type public.app_role as enum (
    'super_admin',
    'admin',
    'moderator',
    'support',
    'user'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.profile_visibility as enum ('public', 'friends', 'private');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  username extensions.citext unique,
  birth_date date,
  state_code text,
  city text,
  bio text,
  church text,
  avatar_path text,
  onboarding_step smallint not null default 0,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profiles_full_name_length check (full_name is null or char_length(full_name) between 2 and 100),
  constraint profiles_username_format check (username is null or username::text ~ '^[a-z0-9._]{3,30}$'),
  constraint profiles_birth_date_adult check (birth_date is null or birth_date <= current_date - interval '18 years'),
  constraint profiles_state_code_format check (state_code is null or state_code ~ '^[A-Z]{2}$'),
  constraint profiles_city_length check (city is null or char_length(city) between 2 and 120),
  constraint profiles_bio_length check (bio is null or char_length(bio) <= 300),
  constraint profiles_church_length check (church is null or char_length(church) <= 160),
  constraint profiles_onboarding_step_range check (onboarding_step between 0 and 6)
);

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'user',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.profile_details (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  personality text[] not null default '{}',
  favorite_season text,
  social_energy text,
  weekend_preferences text[] not null default '{}',
  visited_places text[] not null default '{}',
  desired_places text[] not null default '{}',
  interests text[] not null default '{}',
  hobbies text[] not null default '{}',
  favorite_movies jsonb not null default '[]'::jsonb,
  favorite_series jsonb not null default '[]'::jsonb,
  favorite_songs jsonb not null default '[]'::jsonb,
  favorite_artists jsonb not null default '[]'::jsonb,
  favorite_books jsonb not null default '[]'::jsonb,
  favorite_games jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profile_details_personality_limit check (cardinality(personality) <= 5),
  constraint profile_details_weekend_limit check (cardinality(weekend_preferences) <= 8),
  constraint profile_details_interests_limit check (cardinality(interests) <= 15),
  constraint profile_details_hobbies_limit check (cardinality(hobbies) <= 15),
  constraint profile_details_movies_limit check (jsonb_array_length(favorite_movies) <= 5),
  constraint profile_details_series_limit check (jsonb_array_length(favorite_series) <= 5),
  constraint profile_details_songs_limit check (jsonb_array_length(favorite_songs) <= 5),
  constraint profile_details_artists_limit check (jsonb_array_length(favorite_artists) <= 5),
  constraint profile_details_books_limit check (jsonb_array_length(favorite_books) <= 5),
  constraint profile_details_games_limit check (jsonb_array_length(favorite_games) <= 5)
);

create table if not exists public.profile_privacy (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  profile_visibility public.profile_visibility not null default 'public',
  location_visibility public.profile_visibility not null default 'public',
  favorites_visibility public.profile_visibility not null default 'public',
  gallery_visibility public.profile_visibility not null default 'public',
  dating_enabled boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.validate_profile()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.username is not null then
    new.username = lower(trim(leading '@' from btrim(new.username::text)));
  end if;

  if new.state_code is not null then
    new.state_code = upper(btrim(new.state_code));
  end if;

  if new.full_name is not null then
    new.full_name = btrim(new.full_name);
  end if;

  if new.city is not null then
    new.city = btrim(new.city);
  end if;

  if new.bio is not null then
    new.bio = btrim(new.bio);
  end if;

  if new.birth_date is not null and new.birth_date > current_date - interval '18 years' then
    raise exception 'A ORHA é exclusiva para maiores de 18 anos.' using errcode = '23514';
  end if;

  if new.onboarding_completed_at is not null and (
    new.full_name is null or
    new.username is null or
    new.birth_date is null or
    new.state_code is null or
    new.city is null or
    new.bio is null or
    char_length(new.bio) = 0
  ) then
    raise exception 'O onboarding obrigatório precisa estar completo.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_validate on public.profiles;
create trigger profiles_validate
before insert or update on public.profiles
for each row execute function public.validate_profile();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists user_roles_set_updated_at on public.user_roles;
create trigger user_roles_set_updated_at
before update on public.user_roles
for each row execute function public.set_updated_at();

drop trigger if exists profile_details_set_updated_at on public.profile_details;
create trigger profile_details_set_updated_at
before update on public.profile_details
for each row execute function public.set_updated_at();

drop trigger if exists profile_privacy_set_updated_at on public.profile_privacy;
create trigger profile_privacy_set_updated_at
before update on public.profile_privacy
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'user')
  on conflict (user_id) do nothing;

  insert into public.profile_details (profile_id)
  values (new.id)
  on conflict (profile_id) do nothing;

  insert into public.profile_privacy (profile_id)
  values (new.id)
  on conflict (profile_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.username_is_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    candidate is not null
    and lower(trim(leading '@' from btrim(candidate))) ~ '^[a-z0-9._]{3,30}$'
    and not exists (
      select 1
      from public.profiles
      where username = lower(trim(leading '@' from btrim(candidate)))::extensions.citext
        and id <> auth.uid()
    );
$$;

revoke all on function public.username_is_available(text) from public, anon;
grant execute on function public.username_is_available(text) to authenticated;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.profile_details enable row level security;
alter table public.profile_privacy enable row level security;

create policy "Authenticated users can view completed profiles"
on public.profiles for select
to authenticated
using (id = (select auth.uid()) or onboarding_completed_at is not null);

create policy "Users can update their own profile"
on public.profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "Users can view their own role"
on public.user_roles for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Authenticated users can view details for completed profiles"
on public.profile_details for select
to authenticated
using (
  profile_id = (select auth.uid())
  or exists (
    select 1 from public.profiles
    where profiles.id = profile_details.profile_id
      and profiles.onboarding_completed_at is not null
  )
);

create policy "Users can update their own profile details"
on public.profile_details for update
to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

create policy "Users can view their own privacy settings"
on public.profile_privacy for select
to authenticated
using (profile_id = (select auth.uid()));

create policy "Users can update their own privacy settings"
on public.profile_privacy for update
to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

revoke all on public.profiles, public.user_roles, public.profile_details, public.profile_privacy from anon;
grant select, update on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant select, update on public.profile_details, public.profile_privacy to authenticated;

insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

insert into public.user_roles (user_id, role)
select id, 'user'::public.app_role from auth.users
on conflict (user_id) do nothing;

insert into public.profile_details (profile_id)
select id from auth.users
on conflict (profile_id) do nothing;

insert into public.profile_privacy (profile_id)
select id from auth.users
on conflict (profile_id) do nothing;

comment on table public.user_roles is 'Application roles. Client users can only read their own role; assignments require trusted backend access.';
comment on column public.profile_privacy.dating_enabled is 'Private opt-in flag. Defaults to false and remains unavailable until the dating product is designed.';
