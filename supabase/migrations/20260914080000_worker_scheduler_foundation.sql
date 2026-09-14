-- Install the supported Supabase Cron/pg_net foundation without embedding any secret.
-- Vault values and jobs are provisioned operationally after this migration is applied.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function private.invoke_orha_worker(
  p_worker_name text,
  p_limit integer
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_project_url text;
  v_cron_secret text;
  v_request_id bigint;
begin
  if p_worker_name not in ('account-lifecycle-worker', 'media-cleanup-worker') then
    raise exception 'Unknown ORHA worker.' using errcode = '22023';
  end if;
  if p_limit < 1 or p_limit > 100 then
    raise exception 'Worker batch limit must be between 1 and 100.' using errcode = '22023';
  end if;

  select trim(trailing '/' from secret.decrypted_secret)
  into v_project_url
  from vault.decrypted_secrets as secret
  where secret.name = 'orha_project_url'
  limit 1;

  select secret.decrypted_secret
  into v_cron_secret
  from vault.decrypted_secrets as secret
  where secret.name = 'orha_cron_secret'
  limit 1;

  if v_project_url is null or v_cron_secret is null then
    raise exception 'ORHA worker Vault configuration is incomplete.' using errcode = '55000';
  end if;
  if v_project_url !~ '^https://[a-z0-9-]+[.]supabase[.]co$' then
    raise exception 'ORHA project URL in Vault is invalid.' using errcode = '22023';
  end if;

  select net.http_post(
    url => v_project_url || '/functions/v1/' || p_worker_name,
    headers => jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_cron_secret
    ),
    body => jsonb_build_object('limit', p_limit),
    timeout_milliseconds => 30000
  )
  into v_request_id;

  return v_request_id;
end;
$$;

create or replace function private.configure_orha_worker_schedules()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_job_id bigint;
begin
  if not exists (
    select 1 from vault.decrypted_secrets as secret where secret.name = 'orha_project_url'
  ) or not exists (
    select 1 from vault.decrypted_secrets as secret where secret.name = 'orha_cron_secret'
  ) then
    raise exception 'ORHA worker Vault configuration is incomplete.' using errcode = '55000';
  end if;

  for v_job_id in
    select job.jobid
    from cron.job as job
    where job.jobname in ('orha-account-lifecycle-worker', 'orha-media-cleanup-worker')
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'orha-account-lifecycle-worker',
    '*/5 * * * *',
    'select private.invoke_orha_worker(''account-lifecycle-worker'', 10);'
  );
  perform cron.schedule(
    'orha-media-cleanup-worker',
    '*/10 * * * *',
    'select private.invoke_orha_worker(''media-cleanup-worker'', 50);'
  );
end;
$$;

revoke all on function private.invoke_orha_worker(text, integer) from public, anon, authenticated, service_role;
revoke all on function private.configure_orha_worker_schedules() from public, anon, authenticated, service_role;
grant execute on function private.invoke_orha_worker(text, integer) to postgres;
grant execute on function private.configure_orha_worker_schedules() to postgres;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'ORHA worker scheduler extensions were not installed.';
  end if;
  if to_regprocedure('private.invoke_orha_worker(text,integer)') is null
     or to_regprocedure('private.configure_orha_worker_schedules()') is null then
    raise exception 'ORHA worker scheduler functions are incomplete.';
  end if;
  if has_function_privilege('anon', 'private.invoke_orha_worker(text,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.invoke_orha_worker(text,integer)', 'EXECUTE')
     or has_function_privilege('service_role', 'private.invoke_orha_worker(text,integer)', 'EXECUTE') then
    raise exception 'ORHA worker invocation is exposed to an application role.';
  end if;
end;
$$;
