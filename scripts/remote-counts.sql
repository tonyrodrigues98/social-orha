select json_build_object(
  'auth_users', (select count(*) from auth.users),
  'profiles', (select count(*) from public.profiles),
  'profile_details', (select count(*) from public.profile_details),
  'profile_privacy', (select count(*) from public.profile_privacy),
  'user_roles', (select count(*) from public.user_roles),
  'completed_profiles', (select count(*) from public.profiles where onboarding_completed_at is not null)
);
