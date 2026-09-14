begin;

do $$
begin
  if to_regclass('public.report_evidence') is null
    or to_regclass('public.reports') is null
    or to_regclass('storage.objects') is null
    or to_regprocedure('private.account_access_enabled(uuid)') is null
    or to_regprocedure('private.effective_profile_account_status(uuid)') is null then
    raise exception 'Report-evidence storage policy prerequisites are missing.';
  end if;
end;
$$;

-- Storage policies execute with the caller role. Reading pending evidence through
-- public.report_evidence inside the policy therefore fails its moderator-only RLS.
-- Keep the table private and expose only this narrow authorization predicate.
create or replace function private.can_upload_report_evidence(
  p_object_path text,
  p_actor_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_actor_id is not null
    and p_actor_id = auth.uid()
    and p_object_path is not null
    and p_object_path not like '%..%'
    and split_part(p_object_path, '/', 1) = p_actor_id::text
    and exists (
      select 1
      from public.report_evidence as evidence
      join public.reports as report on report.id = evidence.report_id
      where evidence.uploader_id = p_actor_id
        and evidence.bucket_id = 'report-evidence'
        and evidence.object_path = p_object_path
        and evidence.status = 'pending'
        and report.id::text = split_part(p_object_path, '/', 2)
        and report.reporter_id = p_actor_id
        and report.status in ('open', 'in_review')
    );
$$;

revoke all on function private.can_upload_report_evidence(text, uuid)
from public, anon, authenticated;
grant execute on function private.can_upload_report_evidence(text, uuid)
to authenticated, service_role;

drop policy if exists "ORHA reporters can upload evidence" on storage.objects;
create policy "ORHA reporters can upload evidence"
on storage.objects for insert to authenticated
with check (
  private.account_access_enabled((select auth.uid()))
  and private.effective_profile_account_status((select auth.uid())) = 'active'
  and bucket_id = 'report-evidence'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and storage.extension(name) in ('jpg', 'jpeg', 'png', 'webp')
  and private.can_upload_report_evidence(name, (select auth.uid()))
);

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'ORHA reporters can upload evidence'
      and cmd = 'INSERT'
      and with_check like '%can_upload_report_evidence%'
  ) then
    raise exception 'Report-evidence upload policy was not installed.';
  end if;

  if has_function_privilege('anon', 'private.can_upload_report_evidence(text, uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'private.can_upload_report_evidence(text, uuid)', 'EXECUTE') then
    raise exception 'Report-evidence upload authorization grants are invalid.';
  end if;
end;
$$;

commit;

