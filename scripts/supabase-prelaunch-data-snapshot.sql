-- ORHA pre-launch logical data snapshot.
--
-- This query is intentionally read-only and targets only the foundation tables
-- that exist before the social launch migrations. Its output contains private
-- Auth data (including password hashes) and MUST be encrypted at rest, kept out
-- of Git, and never printed to logs.

begin transaction read only;
set local statement_timeout = '30s';
set local lock_timeout = '3s';

select jsonb_build_object(
  'format', 'orha-prelaunch-v1',
  'generated_at', timezone('utc', now()),
  'database_version', current_setting('server_version'),
  'migrations', coalesce((
    select jsonb_agg(to_jsonb(migration) order by migration.version)
    from supabase_migrations.schema_migrations as migration
  ), '[]'::jsonb),
  'auth_users', coalesce((
    select jsonb_agg(to_jsonb(auth_user) order by auth_user.id)
    from auth.users as auth_user
  ), '[]'::jsonb),
  'auth_identities', coalesce((
    select jsonb_agg(to_jsonb(identity) order by identity.id)
    from auth.identities as identity
  ), '[]'::jsonb),
  'profiles', coalesce((
    select jsonb_agg(to_jsonb(profile) order by profile.id)
    from public.profiles as profile
  ), '[]'::jsonb),
  'profile_details', coalesce((
    select jsonb_agg(to_jsonb(details) order by details.profile_id)
    from public.profile_details as details
  ), '[]'::jsonb),
  'profile_privacy', coalesce((
    select jsonb_agg(to_jsonb(privacy) order by privacy.profile_id)
    from public.profile_privacy as privacy
  ), '[]'::jsonb),
  'user_roles', coalesce((
    select jsonb_agg(to_jsonb(role_record) order by role_record.user_id)
    from public.user_roles as role_record
  ), '[]'::jsonb)
) as snapshot;

commit;
