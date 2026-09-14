-- Persist explicit analytics consent. Collection remains disabled by default and
-- the browser cannot forge the server-authored consent timestamp.

alter table public.user_settings
  add column if not exists analytics_enabled boolean not null default false,
  add column if not exists analytics_consent_updated_at timestamptz;

create or replace function private.stamp_analytics_consent()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.analytics_enabled is distinct from old.analytics_enabled then
    new.analytics_consent_updated_at := timezone('utc', now());
  else
    new.analytics_consent_updated_at := old.analytics_consent_updated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists user_settings_stamp_analytics_consent on public.user_settings;
create trigger user_settings_stamp_analytics_consent
before update on public.user_settings
for each row execute function private.stamp_analytics_consent();

revoke all on function private.stamp_analytics_consent() from public, anon, authenticated;
grant update (analytics_enabled) on public.user_settings to authenticated;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_settings'
      and column_name = 'analytics_enabled'
      and is_nullable = 'NO'
      and column_default = 'false'
  ) then
    raise exception 'analytics_enabled must be a non-null, disabled-by-default setting';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.user_settings'::regclass
      and tgname = 'user_settings_stamp_analytics_consent'
      and not tgisinternal
  ) then
    raise exception 'analytics consent timestamp trigger is missing';
  end if;

  if has_column_privilege(
    'authenticated',
    'public.user_settings',
    'analytics_consent_updated_at',
    'UPDATE'
  ) then
    raise exception 'authenticated must not write analytics_consent_updated_at directly';
  end if;
end;
$$;
