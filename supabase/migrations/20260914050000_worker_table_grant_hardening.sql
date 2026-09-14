-- Remove privileges inherited from public-schema defaults on worker-owned tables.
-- RLS remains defense in depth; browser roles must not hold mutation grants here.

revoke all on table
  public.account_deletion_tombstones,
  public.account_export_artifacts,
  public.community_branding_cleanup,
  public.community_branding_media,
  public.orphan_media_cleanup_claims,
  public.report_target_attachments
from public, anon, authenticated;

grant select on table public.account_export_artifacts to authenticated;
grant select on table public.community_branding_media to authenticated;

grant all on table
  public.account_deletion_tombstones,
  public.account_export_artifacts,
  public.community_branding_cleanup,
  public.community_branding_media,
  public.orphan_media_cleanup_claims,
  public.report_target_attachments
to service_role;

do $$
begin
  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in (
        'account_deletion_tombstones',
        'account_export_artifacts',
        'community_branding_cleanup',
        'community_branding_media',
        'orphan_media_cleanup_claims',
        'report_target_attachments'
      )
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
  ) then
    raise exception 'Browser roles retain worker-table mutation grants.' using errcode = '55000';
  end if;
end
$$;
