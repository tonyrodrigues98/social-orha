-- ORHA launch workers: trusted lifecycle, export, cleanup, and media-promotion contracts.
-- Forward-only hardening migration. It deliberately depends on 20260816170000 and never weakens RLS.

do $$
begin
  if to_regclass('public.account_lifecycle_requests') is null
    or to_regclass('public.profile_media') is null
    or to_regclass('public.post_media') is null
    or to_regclass('public.message_attachments') is null
    or to_regclass('public.audit_logs') is null
    or to_regprocedure('public.list_profile_media_cleanup(integer)') is null
    or to_regprocedure('public.list_post_media_cleanup(integer)') is null
    or to_regprocedure('public.list_message_attachment_cleanup(integer)') is null then
    raise exception 'Apply the ORHA social launch schema before the Edge worker contracts.' using errcode = '55000';
  end if;
end
$$;

create table public.account_export_artifacts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.account_lifecycle_requests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  bucket_id text not null default 'account-exports',
  object_path text not null,
  byte_size bigint not null,
  sha256 text not null,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  constraint account_export_artifacts_bucket check (bucket_id = 'account-exports'),
  constraint account_export_artifacts_owner_path check (split_part(object_path, '/', 1) = user_id::text),
  constraint account_export_artifacts_path_length check (char_length(object_path) between 38 and 300),
  constraint account_export_artifacts_size check (byte_size between 2 and 26214400),
  constraint account_export_artifacts_sha256 check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint account_export_artifacts_expiry check (
    expires_at > created_at
    and expires_at <= created_at + interval '7 days'
  ),
  constraint account_export_artifacts_object_unique unique (bucket_id, object_path)
);

create index account_export_artifacts_expiry_idx
on public.account_export_artifacts (expires_at, id);

-- Short-lived reconciliation evidence closes the crash window between Auth Admin deletion and
-- the worker's final audit write. It has no FK to auth.users by design and is deleted on reconcile.
create table public.account_deletion_tombstones (
  request_id uuid primary key,
  user_id uuid not null unique,
  storage_object_count integer not null default 0,
  started_at timestamptz not null default timezone('utc', now()),
  content_prepared_at timestamptz,
  constraint account_deletion_tombstones_storage_count check (storage_object_count >= 0)
);

create table public.community_branding_media (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  purpose text not null,
  bucket_id text not null default 'community-media',
  object_path text not null,
  mime_type text not null,
  byte_size bigint not null,
  width integer not null,
  height integer not null,
  status public.media_processing_status not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint community_branding_media_purpose check (purpose in ('avatar', 'cover')),
  constraint community_branding_media_bucket check (bucket_id = 'community-media'),
  constraint community_branding_media_owner_path check (split_part(object_path, '/', 1) = owner_id::text),
  constraint community_branding_media_community_path check (split_part(object_path, '/', 2) = 'community'),
  constraint community_branding_media_community_id_path check (split_part(object_path, '/', 3) = community_id::text),
  constraint community_branding_media_purpose_path check (split_part(object_path, '/', 4) = purpose),
  constraint community_branding_media_path_length check (char_length(object_path) between 75 and 300),
  constraint community_branding_media_mime check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
  constraint community_branding_media_size check (byte_size between 1 and 10485760),
  constraint community_branding_media_dimensions check (width between 1 and 12000 and height between 1 and 12000),
  constraint community_branding_media_object_unique unique (bucket_id, object_path)
);

create unique index community_branding_one_pending
on public.community_branding_media (community_id, purpose)
where status = 'pending';

create unique index community_branding_one_ready
on public.community_branding_media (community_id, purpose)
where status = 'ready';

create index community_branding_cleanup_idx
on public.community_branding_media (updated_at, id)
where status in ('pending', 'deleting', 'failed');

create trigger community_branding_media_set_updated_at
before update on public.community_branding_media
for each row execute function public.set_updated_at();

create table public.community_branding_cleanup (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,
  bucket_id text not null default 'community-media',
  object_path text not null,
  requested_at timestamptz not null default timezone('utc', now()),
  constraint community_branding_cleanup_bucket check (bucket_id = 'community-media'),
  constraint community_branding_cleanup_path_length check (char_length(object_path) between 3 and 300),
  constraint community_branding_cleanup_object_unique unique (bucket_id, object_path)
);

create table public.orphan_media_cleanup_claims (
  bucket_id text not null,
  object_path text not null,
  claimed_at timestamptz not null default timezone('utc', now()),
  primary key (bucket_id, object_path),
  constraint orphan_media_cleanup_bucket check (
    bucket_id in ('profile-media', 'community-media', 'chat-media', 'account-exports')
  ),
  constraint orphan_media_cleanup_path check (char_length(object_path) between 3 and 300)
);

-- A report must remain reviewable after the reported record or account is removed. The text
-- snapshot is stored on the report itself while media references are retained separately so the
-- original private object can be authorized and cleaned without depending on live domain rows.
alter table public.reports
  add column target_owner_id uuid references public.profiles(id) on delete set null,
  add column target_snapshot jsonb;

update public.reports
set target_snapshot = jsonb_build_object(
  'schema_version', 1,
  'target_type', target_type::text,
  'target_id', target_id,
  'content_kind', target_type::text,
  'content_text', null,
  'content_created_at', created_at,
  'legacy_unavailable', true
)
where target_snapshot is null;

alter table public.reports
  alter column target_snapshot set not null,
  add constraint reports_target_snapshot_object check (jsonb_typeof(target_snapshot) = 'object'),
  add constraint reports_target_snapshot_size check (octet_length(target_snapshot::text) <= 32768);

create table public.report_target_attachments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  target_owner_id uuid references public.profiles(id) on delete set null,
  source_kind text not null,
  source_id uuid not null,
  bucket_id text not null,
  object_path text not null,
  mime_type text not null,
  byte_size bigint not null,
  duration_seconds numeric,
  waveform jsonb,
  width integer,
  height integer,
  created_at timestamptz not null default timezone('utc', now()),
  retention_until timestamptz not null default (timezone('utc', now()) + interval '180 days'),
  constraint report_target_attachments_source_kind check (source_kind in ('message_attachment', 'post_media')),
  constraint report_target_attachments_bucket check (bucket_id in ('chat-media', 'community-media')),
  constraint report_target_attachments_path_length check (char_length(object_path) between 3 and 360),
  constraint report_target_attachments_mime check (
    mime_type in (
      'image/jpeg', 'image/png', 'image/webp', 'image/avif',
      'video/mp4',
      'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav'
    )
  ),
  constraint report_target_attachments_size check (byte_size between 1 and 26214400),
  constraint report_target_attachments_duration check (duration_seconds is null or duration_seconds between 0 and 3600),
  constraint report_target_attachments_waveform check (
    waveform is null
    or (jsonb_typeof(waveform) = 'array' and jsonb_array_length(waveform) between 1 and 256)
  ),
  constraint report_target_attachments_dimensions check (
    (width is null and height is null)
    or (width between 1 and 12000 and height between 1 and 12000)
  ),
  constraint report_target_attachments_retention check (
    retention_until >= created_at + interval '30 days'
    and retention_until <= created_at + interval '2 years'
  ),
  constraint report_target_attachments_source_unique unique (report_id, source_kind, source_id)
);

create index report_target_attachments_object_idx
on public.report_target_attachments (bucket_id, object_path, retention_until);

create index report_target_attachments_cleanup_idx
on public.report_target_attachments (retention_until, id);

-- Moderation records survive account deletion without retaining a live profile relationship.
-- Evidence remains private and available only to the moderation surface until its own retention
-- policy removes it.
alter table public.reports alter column reporter_id drop not null;
alter table public.reports drop constraint if exists reports_reporter_id_fkey;
alter table public.reports
  add constraint reports_reporter_id_fkey
  foreign key (reporter_id) references public.profiles(id) on delete set null;

alter table public.report_evidence alter column uploader_id drop not null;
alter table public.report_evidence drop constraint if exists report_evidence_uploader_id_fkey;
alter table public.report_evidence
  add constraint report_evidence_uploader_id_fkey
  foreign key (uploader_id) references public.profiles(id) on delete set null;

alter table public.report_evidence
  add column status public.media_processing_status not null default 'pending',
  add column retention_until timestamptz not null default (timezone('utc', now()) + interval '180 days'),
  add constraint report_evidence_retention check (
    retention_until >= created_at + interval '30 days'
    and retention_until <= created_at + interval '2 years'
  );

update public.report_evidence as evidence
set status = case
  when exists (
    select 1 from storage.objects
    where bucket_id = evidence.bucket_id and name = evidence.object_path
  ) then 'ready'::public.media_processing_status
  else 'failed'::public.media_processing_status
end;

create index report_evidence_cleanup_idx
on public.report_evidence (retention_until, created_at, id);

drop policy if exists "Moderators can view report evidence" on public.report_evidence;
create policy "Moderators can view report evidence"
on public.report_evidence for select to authenticated
using (status = 'ready' and private.is_moderator((select auth.uid())));

drop policy if exists "Reporters can attach evidence to open reports" on public.report_evidence;
revoke insert on public.report_evidence from authenticated;

alter table public.account_export_artifacts enable row level security;
alter table public.account_deletion_tombstones enable row level security;
alter table public.community_branding_media enable row level security;
alter table public.community_branding_cleanup enable row level security;
alter table public.orphan_media_cleanup_claims enable row level security;
alter table public.report_target_attachments enable row level security;

create policy "Users can view their own export artifacts"
on public.account_export_artifacts for select to authenticated
using (user_id = (select auth.uid()));

create policy "Community managers can view branding media"
on public.community_branding_media for select to authenticated
using (
  private.account_access_enabled((select auth.uid()))
  and private.can_manage_community(community_id, (select auth.uid()))
);

grant select on public.account_export_artifacts to authenticated;
grant all on public.account_export_artifacts to service_role;
grant all on public.account_deletion_tombstones to service_role;
grant select on public.community_branding_media to authenticated;
grant all on public.community_branding_media to service_role;
grant all on public.community_branding_cleanup to service_role;
grant all on public.orphan_media_cleanup_claims to service_role;
grant all on public.report_target_attachments to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'account-exports',
  'account-exports',
  false,
  26214400,
  array['application/json']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Generic downloadable files require malware scanning and quarantine, which is intentionally not
-- part of the launch contract. Keep only server-verified image and audio media in chat.
do $$
begin
  if exists (
    select 1 from public.message_attachments
    where mime_type = 'application/pdf' and removed_at is null
  ) then
    raise exception 'Quarantine existing PDF chat attachments before applying launch media hardening.'
      using errcode = '55000';
  end if;
end
$$;

alter table public.message_attachments drop constraint if exists message_attachments_mime;
alter table public.message_attachments
  add constraint message_attachments_mime check (
    mime_type in (
      'image/jpeg', 'image/png', 'image/webp', 'image/avif',
      'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav'
    )
  );

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg', 'image/png', 'image/webp', 'image/avif',
  'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav'
]::text[]
where id = 'chat-media';

create or replace function private.enforce_report_snapshot_immutability()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if old.target_snapshot is distinct from new.target_snapshot then
    if old.target_snapshot = jsonb_build_object(
      'schema_version', 1,
      'capture_pending', true,
      'target_type', old.target_type::text,
      'target_id', old.target_id
    ) and not (new.target_snapshot ? 'capture_pending') then
      return new;
    end if;
    raise exception 'A report target snapshot is immutable.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger reports_target_snapshot_immutable
before update of target_snapshot on public.reports
for each row execute function private.enforce_report_snapshot_immutability();

create or replace function private.reject_report_target_attachment_update()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if old.target_owner_id is not null
    and new.target_owner_id is null
    and (to_jsonb(old) - 'target_owner_id') = (to_jsonb(new) - 'target_owner_id') then
    return new;
  end if;
  raise exception 'A reported attachment snapshot is immutable.' using errcode = '42501';
end;
$$;

create trigger report_target_attachments_immutable
before update on public.report_target_attachments
for each row execute function private.reject_report_target_attachment_update();

create or replace function private.report_target_attachment_is_retained(
  p_bucket_id text,
  p_object_path text,
  p_at timestamptz default timezone('utc', now())
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.report_target_attachments as attachment
    join public.reports as report on report.id = attachment.report_id
    left join public.moderation_cases as moderation_case on moderation_case.report_id = report.id
    where attachment.bucket_id = p_bucket_id
      and attachment.object_path = p_object_path
      and (
        attachment.retention_until > coalesce(p_at, timezone('utc', now()))
        or report.status in ('open', 'in_review')
        or moderation_case.status in ('open', 'in_review')
      )
  );
$$;

-- This is deliberately the only target reader used by create_report. Migration 200 may replace
-- the function body to add cleared-message visibility, while the public transaction remains one
-- canonical create_report implementation.
create or replace function private.capture_report_target_snapshot(
  p_report_id uuid,
  p_target_type public.report_target_type,
  p_target_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  report_record public.reports;
  owner_id uuid;
  content_text text;
  content_kind text;
  content_created_at timestamptz;
  target_conversation_id uuid;
begin
  select * into report_record
  from public.reports
  where id = p_report_id
    and reporter_id = p_actor_id
    and target_type = p_target_type
    and target_id = p_target_id
    and target_snapshot ? 'capture_pending'
  for update;

  if not found then
    raise exception 'Report snapshot capture is unavailable.' using errcode = 'P0002';
  end if;

  case p_target_type
    when 'profile' then
      select
        profile.id,
        left(concat_ws(E'\n', profile.full_name, '@' || profile.username::text, profile.bio), 12000),
        'profile',
        profile.created_at
      into owner_id, content_text, content_kind, content_created_at
      from public.profiles as profile
      where profile.id = p_target_id;
    when 'community' then
      select
        community.owner_id,
        left(concat_ws(E'\n', community.name, community.description), 12000),
        'community',
        community.created_at
      into owner_id, content_text, content_kind, content_created_at
      from public.communities as community
      where community.id = p_target_id;
    when 'community_post' then
      select post.author_id, left(post.body, 12000), 'community_post', post.created_at
      into owner_id, content_text, content_kind, content_created_at
      from public.community_posts as post
      where post.id = p_target_id and post.status = 'active';
    when 'post_comment' then
      select comment.author_id, left(comment.body, 12000), 'post_comment', comment.created_at
      into owner_id, content_text, content_kind, content_created_at
      from public.post_comments as comment
      where comment.id = p_target_id and comment.status = 'active';
    when 'message' then
      select
        message.sender_id,
        left(message.body, 12000),
        message.kind::text,
        message.created_at,
        message.conversation_id
      into owner_id, content_text, content_kind, content_created_at, target_conversation_id
      from public.messages as message
      where message.id = p_target_id and message.deleted_at is null;

      if target_conversation_id is not null
        and not private.is_conversation_member(target_conversation_id, p_actor_id, false) then
        raise exception 'Message is unavailable.' using errcode = '42501';
      end if;
  end case;

  if content_created_at is null then
    raise exception 'Report target not found.' using errcode = 'P0002';
  end if;
  if owner_id = p_actor_id then
    raise exception 'You cannot report your own content.' using errcode = '22023';
  end if;

  update public.reports
  set target_owner_id = owner_id,
      target_snapshot = jsonb_build_object(
        'schema_version', 1,
        'target_type', p_target_type::text,
        'target_id', p_target_id,
        'content_kind', content_kind,
        'content_text', content_text,
        'content_created_at', content_created_at
      )
  where id = p_report_id;

  if p_target_type = 'community_post' then
    insert into public.report_target_attachments (
      report_id, target_owner_id, source_kind, source_id, bucket_id, object_path,
      mime_type, byte_size, width, height
    )
    select
      p_report_id, media.owner_id, 'post_media', media.id, media.bucket_id, media.object_path,
      media.mime_type, media.byte_size, media.width, media.height
    from public.post_media as media
    where media.post_id = p_target_id and media.status = 'ready'
    order by media.sort_order, media.id
    limit 6
    on conflict (report_id, source_kind, source_id) do nothing;
  elsif p_target_type = 'message' then
    insert into public.report_target_attachments (
      report_id, target_owner_id, source_kind, source_id, bucket_id, object_path,
      mime_type, byte_size, duration_seconds, waveform, width, height
    )
    select
      p_report_id, attachment.owner_id, 'message_attachment', attachment.id,
      attachment.bucket_id, attachment.object_path, attachment.mime_type, attachment.byte_size,
      attachment.duration_seconds, attachment.waveform, attachment.width, attachment.height
    from public.message_attachments as attachment
    where attachment.message_id = p_target_id and attachment.removed_at is null
    order by attachment.created_at, attachment.id
    limit 1
    on conflict (report_id, source_kind, source_id) do nothing;
  end if;
end;
$$;

drop function public.create_report(public.report_target_type, uuid, text, text);

create function public.create_report(
  p_target_type public.report_target_type,
  p_target_id uuid,
  p_category text,
  p_details text default null
)
returns table (
  id uuid,
  reporter_id uuid,
  target_type public.report_target_type,
  target_id uuid,
  category text,
  details text,
  status public.report_status,
  assigned_to uuid,
  resolution text,
  created_at timestamptz,
  updated_at timestamptz,
  resolved_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  report_record public.reports;
begin
  if actor_id is null or not private.account_access_enabled(actor_id) then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_target_type is null or p_target_id is null
    or coalesce(p_category, '') !~ '^[a-z][a-z0-9_]{1,49}$'
    or (p_details is not null and char_length(p_details) > 2000) then
    raise exception 'Invalid report payload.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'report:' || actor_id::text || ':' || p_target_type::text || ':' || p_target_id::text,
    0
  ));

  select report.* into report_record
  from public.reports as report
  where report.reporter_id = actor_id
    and report.target_type = p_target_type
    and report.target_id = p_target_id
    and report.status in ('open', 'in_review')
  order by report.created_at desc
  limit 1;

  if found then
    return query select
      report_record.id,
      report_record.reporter_id,
      report_record.target_type,
      report_record.target_id,
      report_record.category,
      report_record.details,
      report_record.status,
      report_record.assigned_to,
      report_record.resolution,
      report_record.created_at,
      report_record.updated_at,
      report_record.resolved_at;
    return;
  end if;

  insert into public.reports (
    reporter_id,
    target_type,
    target_id,
    category,
    details,
    target_snapshot
  ) values (
    actor_id,
    p_target_type,
    p_target_id,
    p_category,
    nullif(btrim(p_details), ''),
    jsonb_build_object(
      'schema_version', 1,
      'capture_pending', true,
      'target_type', p_target_type::text,
      'target_id', p_target_id
    )
  )
  returning * into report_record;

  perform private.capture_report_target_snapshot(
    report_record.id,
    p_target_type,
    p_target_id,
    actor_id
  );

  insert into public.moderation_cases (report_id)
  values (report_record.id);

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (
    actor_id,
    'report.created',
    p_target_type::text,
    p_target_id,
    jsonb_build_object('report_id', report_record.id, 'category', p_category)
  );

  select report.* into strict report_record
  from public.reports as report
  where report.id = report_record.id;

  return query select
    report_record.id,
    report_record.reporter_id,
    report_record.target_type,
    report_record.target_id,
    report_record.category,
    report_record.details,
    report_record.status,
    report_record.assigned_to,
    report_record.resolution,
    report_record.created_at,
    report_record.updated_at,
    report_record.resolved_at;
end;
$$;

-- The function above is dropped and recreated because its return contract changes from the
-- composite table type to an explicit, privacy-safe projection. Re-establish least-privilege
-- execution because PostgreSQL grants EXECUTE to PUBLIC on newly created functions by default.
revoke all on function public.create_report(public.report_target_type, uuid, text, text)
from public, anon;
grant execute on function public.create_report(public.report_target_type, uuid, text, text)
to authenticated, service_role;

create or replace function public.get_moderation_report_context(p_report_id uuid)
returns table (
  report_id uuid,
  target_type public.report_target_type,
  target_id uuid,
  target_owner_id uuid,
  content_text text,
  content_kind text,
  content_created_at timestamptz,
  attachment_ids uuid[]
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  report_record public.reports;
begin
  if not private.is_moderator(actor_id) then
    raise exception 'Moderation permission required.' using errcode = '42501';
  end if;

  select * into report_record from public.reports where id = p_report_id;
  if not found then
    raise exception 'Report not found.' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (
    actor_id,
    'moderation.report_context_viewed',
    report_record.target_type::text,
    report_record.target_id,
    jsonb_build_object('report_id', report_record.id, 'snapshot_version', report_record.target_snapshot->'schema_version')
  );

  return query
  select
    report_record.id,
    report_record.target_type,
    report_record.target_id,
    report_record.target_owner_id,
    report_record.target_snapshot->>'content_text',
    report_record.target_snapshot->>'content_kind',
    nullif(report_record.target_snapshot->>'content_created_at', '')::timestamptz,
    coalesce(array_agg(attachment.id order by attachment.created_at) filter (where attachment.id is not null), '{}'::uuid[])
  from public.report_target_attachments as attachment
  where attachment.report_id = report_record.id;
end;
$$;

create or replace function public.get_moderation_report_attachment(
  p_report_id uuid,
  p_attachment_id uuid
)
returns table (
  attachment_id uuid,
  source_kind text,
  bucket_id text,
  object_path text,
  mime_type text,
  byte_size bigint,
  duration_seconds numeric,
  waveform jsonb,
  width integer,
  height integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  report_record public.reports;
  attachment_record public.report_target_attachments;
begin
  if not private.is_moderator(actor_id) then
    raise exception 'Moderation permission required.' using errcode = '42501';
  end if;

  select * into report_record from public.reports where id = p_report_id;
  if not found then
    raise exception 'Report not found.' using errcode = 'P0002';
  end if;

  select * into attachment_record
  from public.report_target_attachments
  where id = p_attachment_id and report_id = p_report_id;
  if not found then
    raise exception 'Reported attachment not found.' using errcode = 'P0002';
  end if;
  if not private.report_target_attachment_is_retained(
    attachment_record.bucket_id,
    attachment_record.object_path
  ) then
    raise exception 'Reported attachment retention has expired.' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (
    actor_id,
    'moderation.report_attachment_viewed',
    report_record.target_type::text,
    report_record.target_id,
    jsonb_build_object('report_id', report_record.id, 'attachment_id', attachment_record.id)
  );

  return query select
    attachment_record.id,
    attachment_record.source_kind,
    attachment_record.bucket_id,
    attachment_record.object_path,
    attachment_record.mime_type,
    attachment_record.byte_size,
    attachment_record.duration_seconds,
    attachment_record.waveform,
    attachment_record.width,
    attachment_record.height;
end;
$$;

create or replace function public.list_report_target_attachment_cleanup(p_limit integer default 100)
returns table (
  attachment_id uuid,
  bucket_id text,
  object_path text,
  delete_object boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    attachment.id,
    attachment.bucket_id,
    attachment.object_path,
    not exists (
      select 1 from public.post_media as media
      where media.bucket_id = attachment.bucket_id and media.object_path = attachment.object_path
    )
    and not exists (
      select 1 from public.message_attachments as message_attachment
      where message_attachment.bucket_id = attachment.bucket_id
        and message_attachment.object_path = attachment.object_path
    )
    and not exists (
      select 1
      from public.report_target_attachments as other
      join public.reports as other_report on other_report.id = other.report_id
      left join public.moderation_cases as other_case on other_case.report_id = other_report.id
      where other.id <> attachment.id
        and other.bucket_id = attachment.bucket_id
        and other.object_path = attachment.object_path
        and (
          other.retention_until > timezone('utc', now())
          or other_report.status in ('open', 'in_review')
          or other_case.status in ('open', 'in_review')
        )
    ) as delete_object
  from public.report_target_attachments as attachment
  join public.reports as report on report.id = attachment.report_id
  left join public.moderation_cases as moderation_case on moderation_case.report_id = report.id
  where attachment.retention_until <= timezone('utc', now())
    and report.status not in ('open', 'in_review')
    and coalesce(moderation_case.status not in ('open', 'in_review'), true)
  order by attachment.retention_until, attachment.id
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

create or replace function public.complete_report_target_attachment_cleanup(p_attachment_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  attachment_record public.report_target_attachments;
  should_delete_object boolean;
begin
  select attachment.* into attachment_record
  from public.report_target_attachments as attachment
  join public.reports as report on report.id = attachment.report_id
  left join public.moderation_cases as moderation_case on moderation_case.report_id = report.id
  where attachment.id = p_attachment_id
    and attachment.retention_until <= timezone('utc', now())
    and report.status not in ('open', 'in_review')
    and coalesce(moderation_case.status not in ('open', 'in_review'), true)
  for update of attachment;

  if not found then
    raise exception 'Expired reported attachment reference not found.' using errcode = 'P0002';
  end if;

  should_delete_object := not exists (
    select 1 from public.post_media
    where bucket_id = attachment_record.bucket_id and object_path = attachment_record.object_path
  ) and not exists (
    select 1 from public.message_attachments
    where bucket_id = attachment_record.bucket_id and object_path = attachment_record.object_path
  ) and not exists (
    select 1
    from public.report_target_attachments as other
    join public.reports as other_report on other_report.id = other.report_id
    left join public.moderation_cases as other_case on other_case.report_id = other_report.id
    where other.id <> attachment_record.id
      and other.bucket_id = attachment_record.bucket_id
      and other.object_path = attachment_record.object_path
      and (
        other.retention_until > timezone('utc', now())
        or other_report.status in ('open', 'in_review')
        or other_case.status in ('open', 'in_review')
      )
  );

  if should_delete_object and exists (
    select 1 from storage.objects
    where bucket_id = attachment_record.bucket_id and name = attachment_record.object_path
  ) then
    raise exception 'Remove the retained report object before completing cleanup.' using errcode = '55000';
  end if;

  delete from public.report_target_attachments where id = attachment_record.id;
  insert into public.audit_logs (event_type, target_type, target_id, metadata)
  values (
    'moderation.report_attachment_retention_completed',
    'report',
    attachment_record.report_id,
    jsonb_build_object(
      'attachment_id', attachment_record.id,
      'bucket_id', attachment_record.bucket_id,
      'object_path', attachment_record.object_path,
      'deleted_object', should_delete_object
    )
  );
end;
$$;

create or replace function public.is_report_target_attachment_retained(
  p_bucket_id text,
  p_object_path text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.report_target_attachment_is_retained(p_bucket_id, p_object_path);
$$;

create or replace function public.list_message_attachment_cleanup(p_limit integer default 100)
returns table (
  attachment_id uuid,
  bucket_id text,
  object_path text,
  delete_object boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    attachment.id,
    attachment.bucket_id,
    attachment.object_path,
    attachment.forwarded_from_attachment_id is null
      and not private.report_target_attachment_is_retained(attachment.bucket_id, attachment.object_path)
  from public.message_attachments as attachment
  where attachment.removed_at is not null
    and attachment.cleanup_requested_at is not null
    and not exists (
      select 1
      from public.message_attachments as child
      where child.forwarded_from_attachment_id = attachment.id
    )
  order by attachment.cleanup_requested_at, attachment.id
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

create or replace function public.complete_message_attachment_cleanup(p_attachment_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  attachment_record public.message_attachments;
  deletes_object boolean;
  retained_object boolean;
begin
  select * into attachment_record
  from public.message_attachments
  where id = p_attachment_id
    and removed_at is not null
    and cleanup_requested_at is not null
  for update;

  if not found then
    raise exception 'Cleanup attachment not found.' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.message_attachments
    where forwarded_from_attachment_id = attachment_record.id
  ) then
    raise exception 'Forwarded attachment references must be cleaned first.' using errcode = '55000';
  end if;

  deletes_object := attachment_record.forwarded_from_attachment_id is null;
  retained_object := private.report_target_attachment_is_retained(
    attachment_record.bucket_id,
    attachment_record.object_path
  );
  if deletes_object and not retained_object and exists (
    select 1 from storage.objects
    where bucket_id = attachment_record.bucket_id and name = attachment_record.object_path
  ) then
    raise exception 'Remove the Storage object before completing attachment cleanup.' using errcode = '55000';
  end if;

  delete from public.message_attachments where id = attachment_record.id;
  insert into public.audit_logs (event_type, target_type, target_id, metadata)
  values (
    'storage.message_attachment_cleanup_completed',
    'message',
    attachment_record.message_id,
    jsonb_build_object(
      'attachment_id', attachment_record.id,
      'bucket_id', attachment_record.bucket_id,
      'object_path', attachment_record.object_path,
      'deleted_object', deletes_object and not retained_object,
      'moderation_retained', retained_object
    )
  );
end;
$$;

create or replace function public.complete_post_media_cleanup(p_media_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  media_record public.post_media;
  retained_object boolean;
begin
  select * into media_record
  from public.post_media
  where id = p_media_id
    and (
      status in ('deleting', 'failed')
      or (status = 'pending' and updated_at < timezone('utc', now()) - interval '1 hour')
    )
  for update;

  if not found then
    raise exception 'Post media cleanup record not found.' using errcode = 'P0002';
  end if;
  retained_object := private.report_target_attachment_is_retained(
    media_record.bucket_id,
    media_record.object_path
  );
  if not retained_object and exists (
    select 1 from storage.objects
    where bucket_id = media_record.bucket_id and name = media_record.object_path
  ) then
    raise exception 'Remove the Storage object before completing post media cleanup.' using errcode = '55000';
  end if;

  delete from public.post_media where id = media_record.id;
end;
$$;

-- Atomically claims one due queue item. A crashed worker can be retried after fifteen minutes.
create or replace function public.claim_account_lifecycle_request(
  p_kind public.account_lifecycle_kind,
  p_request_id uuid default null,
  p_user_id uuid default null
)
returns public.account_lifecycle_requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  lifecycle_record public.account_lifecycle_requests;
begin
  if p_kind is null then
    raise exception 'Lifecycle kind is required.' using errcode = '22023';
  end if;

  select request.* into lifecycle_record
  from public.account_lifecycle_requests as request
  where request.kind = p_kind
    and request.execute_after <= timezone('utc', now())
    and (p_request_id is null or request.id = p_request_id)
    and (p_user_id is null or request.user_id = p_user_id)
    and (
      request.status = 'pending'
      or (
        request.status = 'processing'
        and request.updated_at < timezone('utc', now()) - interval '15 minutes'
      )
    )
  order by request.execute_after, request.id
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.account_lifecycle_requests
  set status = 'processing', updated_at = timezone('utc', now())
  where id = lifecycle_record.id
  returning * into lifecycle_record;

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (
    lifecycle_record.user_id,
    'account.lifecycle_processing',
    'account_lifecycle_request',
    lifecycle_record.id,
    jsonb_build_object('kind', lifecycle_record.kind::text)
  );

  return lifecycle_record;
end;
$$;

create or replace function public.complete_account_lifecycle_request(
  p_request_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns public.account_lifecycle_requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  lifecycle_record public.account_lifecycle_requests;
begin
  if p_request_id is null
    or jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object'
    or octet_length(coalesce(p_metadata, '{}'::jsonb)::text) > 8192 then
    raise exception 'Invalid lifecycle completion metadata.' using errcode = '22023';
  end if;

  select * into lifecycle_record
  from public.account_lifecycle_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Lifecycle request not found.' using errcode = 'P0002';
  end if;
  if lifecycle_record.status = 'completed' then
    return lifecycle_record;
  end if;
  if lifecycle_record.status <> 'processing' then
    raise exception 'Only a processing lifecycle request can be completed.' using errcode = '55000';
  end if;

  update public.account_lifecycle_requests
  set status = 'completed',
      completed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = lifecycle_record.id
  returning * into lifecycle_record;

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (
    lifecycle_record.user_id,
    'account.lifecycle_completed',
    'account_lifecycle_request',
    lifecycle_record.id,
    jsonb_build_object('kind', lifecycle_record.kind::text) || coalesce(p_metadata, '{}'::jsonb)
  );

  return lifecycle_record;
end;
$$;

create or replace function public.fail_account_lifecycle_request(
  p_request_id uuid,
  p_error_code text
)
returns public.account_lifecycle_requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  lifecycle_record public.account_lifecycle_requests;
begin
  if p_request_id is null
    or p_error_code is null
    or p_error_code !~ '^[a-z][a-z0-9_]{2,63}$' then
    raise exception 'A sanitized lifecycle error code is required.' using errcode = '22023';
  end if;

  select * into lifecycle_record
  from public.account_lifecycle_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Lifecycle request not found.' using errcode = 'P0002';
  end if;
  if lifecycle_record.status = 'failed' then
    return lifecycle_record;
  end if;
  if lifecycle_record.status <> 'processing' then
    raise exception 'Only a processing lifecycle request can fail.' using errcode = '55000';
  end if;

  update public.account_lifecycle_requests
  set status = 'failed', updated_at = timezone('utc', now())
  where id = lifecycle_record.id
  returning * into lifecycle_record;

  if lifecycle_record.kind = 'delete' then
    delete from public.account_deletion_tombstones
    where request_id = lifecycle_record.id and user_id = lifecycle_record.user_id;
  end if;

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (
    lifecycle_record.user_id,
    'account.lifecycle_failed',
    'account_lifecycle_request',
    lifecycle_record.id,
    jsonb_build_object('kind', lifecycle_record.kind::text, 'error_code', p_error_code)
  );

  return lifecycle_record;
end;
$$;

-- A transient worker error is not a terminal account decision. Keeping the request in
-- processing also keeps deactivated/deleting accounts restricted and non-cancellable while a
-- stale claim can be recovered after the normal lease window.
create or replace function public.record_account_lifecycle_retry(
  p_request_id uuid,
  p_error_code text
)
returns public.account_lifecycle_requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  lifecycle_record public.account_lifecycle_requests;
begin
  if p_request_id is null
    or p_error_code is null
    or p_error_code !~ '^[a-z][a-z0-9_]{2,63}$' then
    raise exception 'A sanitized lifecycle retry code is required.' using errcode = '22023';
  end if;

  update public.account_lifecycle_requests
  set updated_at = timezone('utc', now())
  where id = p_request_id
    and kind in ('deactivate', 'delete')
    and status = 'processing'
  returning * into lifecycle_record;

  if not found then
    raise exception 'Processing lifecycle request not found.' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (
    lifecycle_record.user_id,
    'account.lifecycle_retry_scheduled',
    'account_lifecycle_request',
    lifecycle_record.id,
    jsonb_build_object('kind', lifecycle_record.kind::text, 'error_code', p_error_code)
  );

  return lifecycle_record;
end;
$$;

create or replace function public.create_account_export_artifact(
  p_request_id uuid,
  p_user_id uuid,
  p_object_path text,
  p_byte_size bigint,
  p_sha256 text,
  p_expires_at timestamptz
)
returns public.account_export_artifacts
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  lifecycle_record public.account_lifecycle_requests;
  artifact_record public.account_export_artifacts;
begin
  select * into lifecycle_record
  from public.account_lifecycle_requests
  where id = p_request_id
    and user_id = p_user_id
    and kind = 'data_export'
    and status = 'processing'
  for update;

  if not found then
    raise exception 'Processing data export request not found.' using errcode = 'P0002';
  end if;
  if p_object_path is null
    or split_part(p_object_path, '/', 1) <> p_user_id::text
    or p_byte_size not between 2 and 26214400
    or p_sha256 !~ '^[0-9a-f]{64}$'
    or p_expires_at <= timezone('utc', now())
    or p_expires_at > timezone('utc', now()) + interval '7 days'
    or not exists (
      select 1 from storage.objects
      where bucket_id = 'account-exports'
        and name = p_object_path
    ) then
    raise exception 'Invalid account export artifact.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('account-exports:' || p_object_path, 0));
  if exists (
    select 1 from public.orphan_media_cleanup_claims
    where bucket_id = 'account-exports' and object_path = p_object_path
  ) or not exists (
    select 1 from storage.objects
    where bucket_id = 'account-exports' and name = p_object_path
  ) then
    raise exception 'The export object is already scheduled for cleanup.' using errcode = '55000';
  end if;

  insert into public.account_export_artifacts (
    request_id,
    user_id,
    object_path,
    byte_size,
    sha256,
    expires_at
  ) values (
    p_request_id,
    p_user_id,
    p_object_path,
    p_byte_size,
    p_sha256,
    p_expires_at
  )
  on conflict (request_id) do update
  set object_path = excluded.object_path,
      byte_size = excluded.byte_size,
      sha256 = excluded.sha256,
      expires_at = excluded.expires_at
  where account_export_artifacts.user_id = excluded.user_id
  returning * into artifact_record;

  if artifact_record.id is null then
    raise exception 'The export request belongs to another artifact owner.' using errcode = '42501';
  end if;

  update public.account_lifecycle_requests
  set status = 'completed',
      completed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = lifecycle_record.id
    and status = 'processing'
  returning * into lifecycle_record;

  if not found then
    raise exception 'The export lifecycle could not be completed atomically.' using errcode = '55000';
  end if;

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (
    lifecycle_record.user_id,
    'account.lifecycle_completed',
    'account_lifecycle_request',
    lifecycle_record.id,
    jsonb_build_object(
      'kind', lifecycle_record.kind::text,
      'artifact_id', artifact_record.id,
      'expires_at', artifact_record.expires_at
    )
  );

  return artifact_record;
end;
$$;

create or replace function public.list_account_export_cleanup(p_limit integer default 100)
returns setof public.account_export_artifacts
language sql
stable
security definer
set search_path = ''
as $$
  select *
  from public.account_export_artifacts
  where expires_at <= timezone('utc', now())
  order by expires_at, id
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

create or replace function public.complete_account_export_cleanup(p_artifact_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  artifact_record public.account_export_artifacts;
begin
  select * into artifact_record
  from public.account_export_artifacts
  where id = p_artifact_id
    and expires_at <= timezone('utc', now())
  for update;

  if not found then
    raise exception 'Expired export artifact not found.' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from storage.objects
    where bucket_id = artifact_record.bucket_id
      and name = artifact_record.object_path
  ) then
    raise exception 'Remove the export object before completing cleanup.' using errcode = '55000';
  end if;

  delete from public.account_export_artifacts where id = artifact_record.id;

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (
    artifact_record.user_id,
    'account.export_artifact_expired',
    'account_lifecycle_request',
    artifact_record.request_id,
    jsonb_build_object('artifact_id', artifact_record.id)
  );
end;
$$;

create or replace function public.list_user_storage_objects(p_user_id uuid)
returns table (bucket_id text, object_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select object.bucket_id, object.name
  from storage.objects as object
  where p_user_id is not null
    and object.bucket_id <> 'report-evidence'
    and not private.report_target_attachment_is_retained(object.bucket_id, object.name)
    and (
      object.owner_id = p_user_id::text
      or split_part(object.name, '/', 1) = p_user_id::text
    )
  order by object.bucket_id, object.name;
$$;

create or replace function public.record_account_deletion_started(
  p_request_id uuid,
  p_storage_object_count integer
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  lifecycle_record public.account_lifecycle_requests;
begin
  select * into lifecycle_record
  from public.account_lifecycle_requests
  where id = p_request_id
    and kind = 'delete'
    and status = 'processing'
    and execute_after <= timezone('utc', now())
  for update;

  if not found then
    raise exception 'Processing deletion request not found.' using errcode = 'P0002';
  end if;
  if coalesce(p_storage_object_count, 0) < 0 then
    raise exception 'Storage object count cannot be negative.' using errcode = '22023';
  end if;

  insert into public.account_deletion_tombstones (
    request_id,
    user_id,
    storage_object_count
  ) values (
    lifecycle_record.id,
    lifecycle_record.user_id,
    coalesce(p_storage_object_count, 0)
  )
  on conflict (request_id) do nothing;

  if found then
    insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
    values (
      lifecycle_record.user_id,
      'account.deletion_started',
      'account_lifecycle_request',
      lifecycle_record.id,
      jsonb_build_object('storage_objects_expected', coalesce(p_storage_object_count, 0))
    );
  else
    update public.account_deletion_tombstones
    set storage_object_count = greatest(storage_object_count, coalesce(p_storage_object_count, 0))
    where request_id = lifecycle_record.id
      and user_id = lifecycle_record.user_id;
  end if;

  return lifecycle_record.user_id;
end;
$$;

-- Redacts user-authored content, preserves moderation evidence anonymously, transfers durable
-- community/group ownership deterministically, and removes every forwarded attachment reference
-- before the Auth user is deleted. The operation is idempotent and transaction-scoped.
create or replace function public.prepare_account_deletion(p_request_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  lifecycle_record public.account_lifecycle_requests;
  community_record record;
  conversation_record record;
  successor_id uuid;
  affected_message_ids uuid[] := '{}'::uuid[];
  affected_messages integer := 0;
  affected_posts integer := 0;
  affected_comments integer := 0;
  removed_attachments integer := 0;
  deleted_rows integer := 0;
  transferred_communities integer := 0;
  archived_communities integer := 0;
  transferred_groups integer := 0;
  deleted_groups integer := 0;
begin
  select * into lifecycle_record
  from public.account_lifecycle_requests
  where id = p_request_id
    and kind = 'delete'
    and status = 'processing'
    and execute_after <= timezone('utc', now())
  for update;

  if not found then
    raise exception 'Processing deletion request not found.' using errcode = 'P0002';
  end if;
  perform 1 from public.account_deletion_tombstones
  where request_id = lifecycle_record.id and user_id = lifecycle_record.user_id
  for update;
  if not found then
    raise exception 'Deletion-start evidence is required before content preparation.' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.account_deletion_tombstones
    where request_id = lifecycle_record.id
      and user_id = lifecycle_record.user_id
      and content_prepared_at is not null
  ) then
    return jsonb_build_object('alreadyPrepared', true);
  end if;

  select coalesce(array_agg(distinct attachment.message_id), '{}'::uuid[])
  into affected_message_ids
  from public.message_attachments as attachment
  where attachment.owner_id = lifecycle_record.user_id;

  update public.messages
  set body = null,
      deleted_at = coalesce(deleted_at, timezone('utc', now())),
      edited_at = coalesce(edited_at, timezone('utc', now()))
  where sender_id = lifecycle_record.user_id
    or id = any(affected_message_ids);
  get diagnostics affected_messages = row_count;

  loop
    delete from public.message_attachments as attachment
    where attachment.owner_id = lifecycle_record.user_id
      and not exists (
        select 1 from public.message_attachments as child
        where child.forwarded_from_attachment_id = attachment.id
      );
    get diagnostics deleted_rows = row_count;
    removed_attachments := removed_attachments + deleted_rows;
    exit when deleted_rows = 0;
  end loop;

  if exists (
    select 1 from public.message_attachments
    where owner_id = lifecycle_record.user_id
  ) then
    raise exception 'The forwarded attachment tree could not be removed safely.' using errcode = '55000';
  end if;

  update public.community_posts
  set body = 'Conteudo removido', status = 'removed', updated_at = timezone('utc', now())
  where author_id = lifecycle_record.user_id;
  get diagnostics affected_posts = row_count;

  update public.post_comments
  set body = 'Conteudo removido', status = 'removed', updated_at = timezone('utc', now())
  where author_id = lifecycle_record.user_id;
  get diagnostics affected_comments = row_count;

  for community_record in
    select id
    from public.communities
    where owner_id = lifecycle_record.user_id
    order by id
    for update
  loop
    select membership.profile_id into successor_id
    from public.community_memberships as membership
    where membership.community_id = community_record.id
      and membership.profile_id <> lifecycle_record.user_id
      and membership.status = 'active'
      and private.is_socially_active(membership.profile_id)
    order by
      case membership.role when 'moderator' then 0 when 'member' then 1 else 2 end,
      membership.joined_at,
      membership.created_at,
      membership.profile_id
    limit 1;

    if successor_id is null then
      update public.communities
      set owner_id = null,
          avatar_path = case when split_part(coalesce(avatar_path, ''), '/', 1) = lifecycle_record.user_id::text then null else avatar_path end,
          cover_path = case when split_part(coalesce(cover_path, ''), '/', 1) = lifecycle_record.user_id::text then null else cover_path end,
          archived_at = coalesce(archived_at, timezone('utc', now())),
          updated_at = timezone('utc', now())
      where id = community_record.id;
      update public.community_memberships
      set role = 'member', status = 'left', joined_at = null, updated_at = timezone('utc', now())
      where community_id = community_record.id and status in ('pending', 'active');
      update public.community_posts
      set status = 'removed', updated_at = timezone('utc', now())
      where community_id = community_record.id and status <> 'removed';
      update public.post_media
      set status = 'deleting', updated_at = timezone('utc', now())
      where post_id in (
        select id from public.community_posts where community_id = community_record.id
      ) and status in ('pending', 'ready', 'failed');
      archived_communities := archived_communities + 1;
    else
      update public.community_memberships
      set role = 'owner', updated_at = timezone('utc', now())
      where community_id = community_record.id and profile_id = successor_id;
      update public.communities
      set owner_id = successor_id,
          avatar_path = case when split_part(coalesce(avatar_path, ''), '/', 1) = lifecycle_record.user_id::text then null else avatar_path end,
          cover_path = case when split_part(coalesce(cover_path, ''), '/', 1) = lifecycle_record.user_id::text then null else cover_path end,
          updated_at = timezone('utc', now())
      where id = community_record.id;
      transferred_communities := transferred_communities + 1;
    end if;
  end loop;

  update public.communities
  set avatar_path = case when split_part(coalesce(avatar_path, ''), '/', 1) = lifecycle_record.user_id::text then null else avatar_path end,
      cover_path = case when split_part(coalesce(cover_path, ''), '/', 1) = lifecycle_record.user_id::text then null else cover_path end,
      updated_at = timezone('utc', now())
  where split_part(coalesce(avatar_path, ''), '/', 1) = lifecycle_record.user_id::text
     or split_part(coalesce(cover_path, ''), '/', 1) = lifecycle_record.user_id::text;

  for conversation_record in
    select conversation.id
    from public.conversations as conversation
    where conversation.kind = 'group'
      and (
        conversation.created_by = lifecycle_record.user_id
        or exists (
          select 1 from public.conversation_members as membership
          where membership.conversation_id = conversation.id
            and membership.profile_id = lifecycle_record.user_id
            and membership.role = 'owner'
            and membership.status = 'active'
        )
      )
    order by conversation.id
    for update
  loop
    select membership.profile_id into successor_id
    from public.conversation_members as membership
    where membership.conversation_id = conversation_record.id
      and membership.profile_id <> lifecycle_record.user_id
      and membership.status = 'active'
      and private.is_socially_active(membership.profile_id)
    order by
      case membership.role when 'owner' then 0 when 'admin' then 1 when 'member' then 2 else 3 end,
      membership.joined_at,
      membership.created_at,
      membership.profile_id
    limit 1;

    if successor_id is null then
      delete from public.conversations where id = conversation_record.id;
      deleted_groups := deleted_groups + 1;
    else
      update public.conversation_members
      set role = 'owner', updated_at = timezone('utc', now())
      where conversation_id = conversation_record.id and profile_id = successor_id;
      update public.conversations
      set created_by = successor_id, updated_at = timezone('utc', now())
      where id = conversation_record.id;
      transferred_groups := transferred_groups + 1;
    end if;
  end loop;

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (
    lifecycle_record.user_id,
    'account.deletion_content_prepared',
    'account_lifecycle_request',
    lifecycle_record.id,
    jsonb_build_object(
      'messages_redacted', affected_messages,
      'attachments_unlinked', removed_attachments,
      'posts_redacted', affected_posts,
      'comments_redacted', affected_comments,
      'communities_transferred', transferred_communities,
      'communities_archived', archived_communities,
      'groups_transferred', transferred_groups,
      'groups_deleted', deleted_groups,
      'moderation_evidence_retained', true
    )
  );

  update public.account_deletion_tombstones
  set content_prepared_at = timezone('utc', now())
  where request_id = lifecycle_record.id and user_id = lifecycle_record.user_id;

  return jsonb_build_object(
    'messagesRedacted', affected_messages,
    'attachmentsUnlinked', removed_attachments,
    'postsRedacted', affected_posts,
    'commentsRedacted', affected_comments,
    'communitiesTransferred', transferred_communities,
    'communitiesArchived', archived_communities,
    'groupsTransferred', transferred_groups,
    'groupsDeleted', deleted_groups
  );
end;
$$;

create or replace function public.list_account_deletion_reconciliation(p_limit integer default 25)
returns setof public.account_deletion_tombstones
language sql
stable
security definer
set search_path = ''
as $$
  select tombstone.*
  from public.account_deletion_tombstones as tombstone
  where not exists (select 1 from auth.users where id = tombstone.user_id)
  order by tombstone.started_at, tombstone.request_id
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

-- Called only after Auth Admin confirms hard deletion. The request row has then cascaded away.
create or replace function public.record_account_deletion_completed(
  p_request_id uuid,
  p_user_id uuid,
  p_storage_object_count integer
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  tombstone_record public.account_deletion_tombstones;
begin
  if p_request_id is null or p_user_id is null or coalesce(p_storage_object_count, 0) < 0 then
    raise exception 'Invalid completed deletion evidence.' using errcode = '22023';
  end if;
  select * into tombstone_record
  from public.account_deletion_tombstones
  where request_id = p_request_id
    and user_id = p_user_id
    and content_prepared_at is not null
  for update;

  if not found
    or exists (select 1 from auth.users where id = p_user_id)
    or exists (select 1 from public.account_lifecycle_requests where id = p_request_id) then
    raise exception 'Auth user deletion is not complete.' using errcode = '55000';
  end if;

  insert into public.audit_logs (event_type, target_type, target_id, metadata)
  values (
    'account.deletion_completed',
    'account_lifecycle_request',
    p_request_id,
    jsonb_build_object('storage_objects_removed', tombstone_record.storage_object_count)
  );

  delete from public.account_deletion_tombstones
  where request_id = p_request_id and user_id = p_user_id;
end;
$$;

-- Promotion is no longer callable from an authenticated browser. Edge validation passes an explicit owner.
create or replace function public.finalize_validated_profile_media(
  p_media_id uuid,
  p_profile_id uuid
)
returns public.profile_media
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  media_record public.profile_media;
begin
  select * into media_record
  from public.profile_media
  where id = p_media_id
    and profile_id = p_profile_id
    and status = 'pending'
    and private.account_access_enabled(p_profile_id)
    and private.effective_profile_account_status(p_profile_id) = 'active'
  for update;

  if not found then
    raise exception 'Pending profile media not found.' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(media_record.bucket_id || ':' || media_record.object_path, 0));
  if exists (
    select 1 from public.orphan_media_cleanup_claims
    where bucket_id = media_record.bucket_id and object_path = media_record.object_path
  ) then
    raise exception 'The profile media object is already scheduled for cleanup.' using errcode = '55000';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = media_record.bucket_id
      and name = media_record.object_path
      and (owner_id = p_profile_id::text or split_part(name, '/', 1) = p_profile_id::text)
  ) then
    raise exception 'Validated profile Storage object not found.' using errcode = 'P0002';
  end if;

  if media_record.purpose in ('avatar', 'cover') then
    update public.profile_media
    set status = 'deleting'
    where profile_id = p_profile_id
      and purpose = media_record.purpose
      and status = 'ready'
      and id <> media_record.id;
  end if;

  update public.profile_media
  set status = 'ready', updated_at = timezone('utc', now())
  where id = media_record.id
  returning * into media_record;

  if media_record.purpose = 'avatar' then
    update public.profiles
    set avatar_path = media_record.object_path
    where id = p_profile_id;
  end if;

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (
    p_profile_id,
    'storage.profile_media_validated',
    'profile_media',
    media_record.id,
    jsonb_build_object('purpose', media_record.purpose::text, 'mime_type', media_record.mime_type)
  );

  return media_record;
end;
$$;

-- Removal becomes asynchronous: metadata remains authoritative until the trusted cleanup worker
-- has deleted the private object. This prevents live metadata from pointing at a browser-deleted file.
create or replace function public.remove_profile_media(p_media_id uuid)
returns public.profile_media
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  removed public.profile_media;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into removed
  from public.profile_media
  where id = p_media_id
    and profile_id = actor_id
    and status <> 'deleting'
  for update;

  if not found then
    select * into removed
    from public.profile_media
    where id = p_media_id and profile_id = actor_id and status = 'deleting';
    if found then return removed; end if;
    raise exception 'Profile media not found.' using errcode = 'P0002';
  end if;

  update public.profile_media
  set status = 'deleting', updated_at = timezone('utc', now())
  where id = removed.id
  returning * into removed;

  if removed.purpose = 'avatar' then
    update public.profiles
    set avatar_path = null
    where id = actor_id and avatar_path = removed.object_path;
  elsif removed.purpose = 'gallery' then
    with ordering as (
      select
        id,
        (row_number() over (order by sort_order, created_at, id) - 1)::smallint as next_order
      from public.profile_media
      where profile_id = actor_id
        and purpose = 'gallery'
        and status in ('pending', 'ready')
    )
    update public.profile_media as media
    set sort_order = ordering.next_order
    from ordering
    where media.id = ordering.id;
  end if;

  return removed;
end;
$$;

create or replace function public.finalize_validated_post_media(
  p_media_id uuid,
  p_owner_id uuid
)
returns public.post_media
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  media_record public.post_media;
begin
  select media.* into media_record
  from public.post_media as media
  join public.community_posts as post on post.id = media.post_id
  where media.id = p_media_id
    and media.owner_id = p_owner_id
    and media.status = 'pending'
    and post.author_id = p_owner_id
    and post.status = 'active'
    and private.is_socially_active(p_owner_id)
  for update of media;

  if not found then
    raise exception 'Pending post media not found.' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(media_record.bucket_id || ':' || media_record.object_path, 0));
  if exists (
    select 1 from public.orphan_media_cleanup_claims
    where bucket_id = media_record.bucket_id and object_path = media_record.object_path
  ) then
    raise exception 'The post media object is already scheduled for cleanup.' using errcode = '55000';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = media_record.bucket_id
      and name = media_record.object_path
      and (owner_id = p_owner_id::text or split_part(name, '/', 1) = p_owner_id::text)
  ) then
    raise exception 'Validated post Storage object not found.' using errcode = 'P0002';
  end if;

  update public.post_media
  set status = 'ready', updated_at = timezone('utc', now())
  where id = media_record.id
  returning * into media_record;

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (
    p_owner_id,
    'storage.post_media_validated',
    'post_media',
    media_record.id,
    jsonb_build_object('post_id', media_record.post_id, 'mime_type', media_record.mime_type)
  );

  return media_record;
end;
$$;

create or replace function public.reserve_community_branding_media(
  p_community_id uuid,
  p_purpose text,
  p_object_path text,
  p_mime_type text,
  p_byte_size bigint,
  p_width integer,
  p_height integer
)
returns public.community_branding_media
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  media_record public.community_branding_media;
begin
  if actor_id is null
    or p_community_id is null
    or p_purpose not in ('avatar', 'cover')
    or not private.account_access_enabled(actor_id)
    or not private.can_manage_community(p_community_id, actor_id)
    or p_object_path is null
    or split_part(p_object_path, '/', 1) <> actor_id::text
    or split_part(p_object_path, '/', 2) <> 'community'
    or split_part(p_object_path, '/', 3) <> p_community_id::text
    or split_part(p_object_path, '/', 4) <> p_purpose
    or p_object_path like '%..%'
    or p_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
    or p_byte_size not between 1 and 10485760
    or p_width not between 1 and 12000
    or p_height not between 1 and 12000 then
    raise exception 'Invalid community branding reservation.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_community_id::text || ':' || p_purpose, 0));

  select * into media_record
  from public.community_branding_media
  where community_id = p_community_id
    and purpose = p_purpose
    and object_path = p_object_path
    and owner_id = actor_id
    and status in ('pending', 'ready')
  for update;

  if found then
    if media_record.mime_type <> p_mime_type
      or media_record.byte_size <> p_byte_size
      or media_record.width <> p_width
      or media_record.height <> p_height then
      raise exception 'The branding path is already bound to another payload.' using errcode = '23505';
    end if;
    return media_record;
  end if;

  update public.community_branding_media
  set status = 'failed', updated_at = timezone('utc', now())
  where community_id = p_community_id
    and purpose = p_purpose
    and status = 'pending';

  insert into public.community_branding_media (
    community_id, owner_id, purpose, object_path, mime_type, byte_size, width, height
  ) values (
    p_community_id, actor_id, p_purpose, p_object_path, p_mime_type, p_byte_size, p_width, p_height
  )
  returning * into media_record;

  return media_record;
end;
$$;

create or replace function public.finalize_validated_community_branding(
  p_media_id uuid,
  p_owner_id uuid
)
returns public.community_branding_media
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  media_record public.community_branding_media;
  previous_path text;
begin
  select media.* into media_record
  from public.community_branding_media as media
  where media.id = p_media_id
    and media.owner_id = p_owner_id
    and media.status = 'pending'
    and private.can_manage_community(media.community_id, p_owner_id)
    and private.is_socially_active(p_owner_id)
  for update;

  if not found then
    raise exception 'Pending community branding media not found.' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(media_record.bucket_id || ':' || media_record.object_path, 0));
  if exists (
    select 1 from public.orphan_media_cleanup_claims
    where bucket_id = media_record.bucket_id and object_path = media_record.object_path
  ) then
    raise exception 'The branding object is already scheduled for cleanup.' using errcode = '55000';
  end if;

  perform 1
  from storage.objects
  where bucket_id = media_record.bucket_id
    and name = media_record.object_path
    and (owner_id = p_owner_id::text or split_part(name, '/', 1) = p_owner_id::text)
  for update;

  if not found then
    raise exception 'Validated community branding object not found.' using errcode = 'P0002';
  end if;

  select case media_record.purpose
    when 'avatar' then avatar_path
    else cover_path
  end
  into previous_path
  from public.communities
  where id = media_record.community_id
  for update;

  update public.community_branding_media
  set status = 'deleting', updated_at = timezone('utc', now())
  where community_id = media_record.community_id
    and purpose = media_record.purpose
    and status = 'ready'
    and id <> media_record.id;

  if previous_path is not null
    and previous_path <> media_record.object_path
    and not exists (
      select 1 from public.community_branding_media
      where bucket_id = 'community-media' and object_path = previous_path
    ) then
    insert into public.community_branding_cleanup (owner_id, object_path)
    values (
      case when split_part(previous_path, '/', 1) = p_owner_id::text then p_owner_id else null end,
      previous_path
    )
    on conflict (bucket_id, object_path) do nothing;
  end if;

  update public.community_branding_media
  set status = 'ready', updated_at = timezone('utc', now())
  where id = media_record.id
  returning * into media_record;

  if media_record.purpose = 'avatar' then
    update public.communities
    set avatar_path = media_record.object_path, updated_at = timezone('utc', now())
    where id = media_record.community_id;
  else
    update public.communities
    set cover_path = media_record.object_path, updated_at = timezone('utc', now())
    where id = media_record.community_id;
  end if;

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (
    p_owner_id,
    'storage.community_branding_validated',
    'community',
    media_record.community_id,
    jsonb_build_object('media_id', media_record.id, 'purpose', media_record.purpose, 'mime_type', media_record.mime_type)
  );

  return media_record;
end;
$$;

create or replace function public.reject_community_branding_validation(
  p_media_id uuid,
  p_owner_id uuid,
  p_reason_code text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  media_record public.community_branding_media;
begin
  if p_reason_code !~ '^[a-z][a-z0-9_]{2,63}$' then
    raise exception 'Invalid branding rejection code.' using errcode = '22023';
  end if;

  update public.community_branding_media
  set status = 'failed', updated_at = timezone('utc', now())
  where id = p_media_id and owner_id = p_owner_id and status = 'pending'
  returning * into media_record;

  if found then
    insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
    values (
      p_owner_id,
      'storage.community_branding_rejected',
      'community',
      media_record.community_id,
      jsonb_build_object('media_id', media_record.id, 'reason_code', p_reason_code)
    );
  end if;
end;
$$;

create or replace function public.list_community_branding_cleanup(p_limit integer default 100)
returns table (cleanup_kind text, cleanup_id uuid, bucket_id text, object_path text)
language sql
stable
security definer
set search_path = ''
as $$
  with candidates as (
    select
      'media'::text as cleanup_kind,
      media.id as cleanup_id,
      media.bucket_id,
      media.object_path,
      media.updated_at as requested_at
    from public.community_branding_media as media
    where media.status in ('deleting', 'failed')
       or (media.status = 'pending' and media.updated_at < timezone('utc', now()) - interval '1 hour')
    union all
    select
      'legacy'::text,
      cleanup.id,
      cleanup.bucket_id,
      cleanup.object_path,
      cleanup.requested_at
    from public.community_branding_cleanup as cleanup
  )
  select cleanup_kind, cleanup_id, bucket_id, object_path
  from candidates
  order by requested_at, cleanup_id
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

create or replace function public.complete_community_branding_cleanup(
  p_cleanup_kind text,
  p_cleanup_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  target_bucket text;
  target_path text;
begin
  if p_cleanup_kind = 'media' then
    select bucket_id, object_path into target_bucket, target_path
    from public.community_branding_media
    where id = p_cleanup_id
      and (status in ('deleting', 'failed') or (status = 'pending' and updated_at < timezone('utc', now()) - interval '1 hour'))
    for update;
  elsif p_cleanup_kind = 'legacy' then
    select bucket_id, object_path into target_bucket, target_path
    from public.community_branding_cleanup
    where id = p_cleanup_id
    for update;
  else
    raise exception 'Invalid branding cleanup kind.' using errcode = '22023';
  end if;

  if not found then
    raise exception 'Branding cleanup item not found.' using errcode = 'P0002';
  end if;
  if exists (select 1 from storage.objects where bucket_id = target_bucket and name = target_path) then
    raise exception 'Remove the branding object before completing cleanup.' using errcode = '55000';
  end if;

  if p_cleanup_kind = 'media' then
    delete from public.community_branding_media where id = p_cleanup_id;
  else
    delete from public.community_branding_cleanup where id = p_cleanup_id;
  end if;
end;
$$;

create or replace function public.reserve_report_evidence(
  p_report_id uuid,
  p_object_path text,
  p_mime_type text,
  p_byte_size bigint
)
returns public.report_evidence
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  evidence_record public.report_evidence;
begin
  if actor_id is null
    or not private.account_access_enabled(actor_id)
    or private.effective_profile_account_status(actor_id) <> 'active'
    or split_part(p_object_path, '/', 1) <> actor_id::text
    or split_part(p_object_path, '/', 2) <> p_report_id::text
    or p_object_path like '%..%'
    or p_mime_type not in ('image/jpeg', 'image/png', 'image/webp')
    or p_byte_size not between 1 and 10485760
    or not exists (
      select 1 from public.reports
      where id = p_report_id
        and reporter_id = actor_id
        and status in ('open', 'in_review')
    ) then
    raise exception 'Invalid report evidence reservation.' using errcode = '22023';
  end if;

  select * into evidence_record
  from public.report_evidence
  where report_id = p_report_id
    and uploader_id = actor_id
    and object_path = p_object_path
  for update;
  if found then
    if evidence_record.mime_type <> p_mime_type or evidence_record.byte_size <> p_byte_size then
      raise exception 'The evidence path is already bound to another payload.' using errcode = '23505';
    end if;
    return evidence_record;
  end if;

  insert into public.report_evidence (
    report_id, uploader_id, object_path, mime_type, byte_size, status
  ) values (
    p_report_id, actor_id, p_object_path, p_mime_type, p_byte_size, 'pending'
  ) returning * into evidence_record;
  return evidence_record;
end;
$$;

create or replace function public.finalize_validated_report_evidence(
  p_evidence_id uuid,
  p_owner_id uuid
)
returns public.report_evidence
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  evidence_record public.report_evidence;
begin
  select evidence.* into evidence_record
  from public.report_evidence as evidence
  join public.reports as report on report.id = evidence.report_id
  where evidence.id = p_evidence_id
    and evidence.uploader_id = p_owner_id
    and evidence.status = 'pending'
    and report.reporter_id = p_owner_id
    and report.status in ('open', 'in_review')
    and private.account_access_enabled(p_owner_id)
    and private.effective_profile_account_status(p_owner_id) = 'active'
  for update of evidence;

  if not found then
    raise exception 'Pending report evidence not found.' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = evidence_record.bucket_id
      and name = evidence_record.object_path
      and (owner_id = p_owner_id::text or split_part(name, '/', 1) = p_owner_id::text)
  ) then
    raise exception 'Validated report evidence object not found.' using errcode = 'P0002';
  end if;

  update public.report_evidence
  set status = 'ready'
  where id = evidence_record.id
  returning * into evidence_record;

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (
    p_owner_id,
    'storage.report_evidence_validated',
    'report',
    evidence_record.report_id,
    jsonb_build_object('evidence_id', evidence_record.id, 'mime_type', evidence_record.mime_type)
  );
  return evidence_record;
end;
$$;

create or replace function public.reject_report_evidence_validation(
  p_evidence_id uuid,
  p_owner_id uuid,
  p_reason_code text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  evidence_record public.report_evidence;
begin
  if p_reason_code !~ '^[a-z][a-z0-9_]{2,63}$' then
    raise exception 'Invalid evidence rejection code.' using errcode = '22023';
  end if;
  update public.report_evidence
  set status = 'failed'
  where id = p_evidence_id and uploader_id = p_owner_id and status = 'pending'
  returning * into evidence_record;
  if found then
    insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
    values (
      p_owner_id,
      'storage.report_evidence_rejected',
      'report',
      evidence_record.report_id,
      jsonb_build_object('evidence_id', evidence_record.id, 'reason_code', p_reason_code)
    );
  end if;
end;
$$;

create or replace function public.list_report_evidence_cleanup(p_limit integer default 100)
returns setof public.report_evidence
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.report_evidence
  where status = 'failed'
     or (status = 'pending' and created_at < timezone('utc', now()) - interval '1 hour')
     or (
       status = 'ready'
       and retention_until <= timezone('utc', now())
       and exists (
         select 1
         from public.reports as report
         left join public.moderation_cases as moderation_case on moderation_case.report_id = report.id
         where report.id = report_evidence.report_id
           and report.status not in ('open', 'in_review')
           and coalesce(moderation_case.status not in ('open', 'in_review'), true)
       )
     )
  order by created_at, id
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

create or replace function public.complete_report_evidence_cleanup(p_evidence_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  evidence_record public.report_evidence;
begin
  select * into evidence_record
  from public.report_evidence
  where id = p_evidence_id
    and (
      status = 'failed'
      or (status = 'pending' and created_at < timezone('utc', now()) - interval '1 hour')
      or (
        status = 'ready'
        and retention_until <= timezone('utc', now())
        and exists (
          select 1
          from public.reports as report
          left join public.moderation_cases as moderation_case on moderation_case.report_id = report.id
          where report.id = report_evidence.report_id
            and report.status not in ('open', 'in_review')
            and coalesce(moderation_case.status not in ('open', 'in_review'), true)
        )
      )
    )
  for update;
  if not found then
    raise exception 'Evidence cleanup item not found.' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from storage.objects
    where bucket_id = evidence_record.bucket_id and name = evidence_record.object_path
  ) then
    raise exception 'Remove the evidence object before completing cleanup.' using errcode = '55000';
  end if;
  delete from public.report_evidence where id = evidence_record.id;
end;
$$;

create or replace function public.reject_media_validation(
  p_scope text,
  p_media_id uuid,
  p_owner_id uuid,
  p_reason_code text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  if p_scope not in ('profile', 'post')
    or p_reason_code !~ '^[a-z][a-z0-9_]{2,63}$' then
    raise exception 'Invalid media rejection.' using errcode = '22023';
  end if;

  if p_scope = 'profile' then
    update public.profile_media
    set status = 'failed', updated_at = timezone('utc', now())
    where id = p_media_id and profile_id = p_owner_id and status = 'pending';
  else
    update public.post_media
    set status = 'failed', updated_at = timezone('utc', now())
    where id = p_media_id and owner_id = p_owner_id and status = 'pending';
  end if;
  get diagnostics affected = row_count;

  if affected > 0 then
    insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
    values (
      p_owner_id,
      'storage.media_validation_rejected',
      case when p_scope = 'profile' then 'profile_media' else 'post_media' end,
      p_media_id,
      jsonb_build_object('scope', p_scope, 'reason_code', p_reason_code)
    );
  end if;
end;
$$;

create or replace function private.persist_authoritative_message(
  p_conversation_id uuid,
  p_actor_id uuid,
  p_kind public.message_kind,
  p_body text,
  p_reply_to_message_id uuid,
  p_client_message_id uuid,
  p_forwarded_from_message_id uuid default null
)
returns public.messages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  message_record public.messages;
  normalized_body text := case when p_body is null then null else nullif(btrim(p_body), '') end;
begin
  if p_actor_id is null
    or p_conversation_id is null
    or p_kind is null
    or p_kind = 'system'
    or not private.can_send_to_conversation(p_conversation_id, p_actor_id)
    or (p_kind = 'text' and char_length(coalesce(normalized_body, '')) not between 1 and 5000)
    or (p_kind <> 'text' and normalized_body is not null and char_length(normalized_body) > 5000) then
    raise exception 'Invalid or unauthorized message payload.' using errcode = '42501';
  end if;
  if p_reply_to_message_id is not null and not exists (
    select 1 from public.messages
    where id = p_reply_to_message_id
      and conversation_id = p_conversation_id
      and deleted_at is null
  ) then
    raise exception 'Reply target is unavailable.' using errcode = '22023';
  end if;

  if p_client_message_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(
      p_conversation_id::text || ':' || p_actor_id::text || ':' || p_client_message_id::text,
      0
    ));
    select * into message_record
    from public.messages
    where conversation_id = p_conversation_id
      and sender_id = p_actor_id
      and client_message_id = p_client_message_id
    for update;

    if found then
      if message_record.kind <> p_kind
        or message_record.body is distinct from normalized_body
        or message_record.reply_to_message_id is distinct from p_reply_to_message_id
        or message_record.forwarded_from_message_id is distinct from p_forwarded_from_message_id then
        raise exception 'The client message identifier is already bound to another payload.' using errcode = '23505';
      end if;
      return message_record;
    end if;
  end if;

  insert into public.messages (
    conversation_id,
    sender_id,
    client_message_id,
    kind,
    body,
    reply_to_message_id,
    forwarded_from_message_id
  ) values (
    p_conversation_id,
    p_actor_id,
    p_client_message_id,
    p_kind,
    normalized_body,
    p_reply_to_message_id,
    p_forwarded_from_message_id
  )
  returning * into message_record;

  update public.conversations
  set updated_at = timezone('utc', now())
  where id = p_conversation_id;

  insert into public.message_receipts (message_id, profile_id, delivered_at)
  select message_record.id, member.profile_id, null
  from public.conversation_members as member
  where member.conversation_id = p_conversation_id
    and member.status = 'active'
    and member.profile_id <> p_actor_id
  on conflict do nothing;

  insert into public.notifications (recipient_id, actor_id, type, entity_type, entity_id, payload, dedupe_key)
  select
    member.profile_id,
    p_actor_id,
    'message_received',
    'conversation',
    p_conversation_id,
    '{}'::jsonb,
    'message:' || message_record.id::text
  from public.conversation_members as member
  join public.notification_preferences as preference on preference.profile_id = member.profile_id
  left join public.conversation_preferences as conversation_preference
    on conversation_preference.conversation_id = member.conversation_id
   and conversation_preference.profile_id = member.profile_id
  where member.conversation_id = p_conversation_id
    and member.status = 'active'
    and member.profile_id <> p_actor_id
    and preference.messages_enabled
    and coalesce(conversation_preference.notifications_enabled, true)
    and (conversation_preference.muted_until is null or conversation_preference.muted_until <= timezone('utc', now()))
  on conflict do nothing;

  return message_record;
end;
$$;

-- The browser can create text immediately. Media messages must go through Edge byte validation
-- and the service-only atomic function below, so recipients never observe an attachment-less row.
create or replace function public.send_message(
  p_conversation_id uuid,
  p_kind public.message_kind,
  p_body text default null,
  p_reply_to_message_id uuid default null,
  p_client_message_id uuid default null
)
returns public.messages
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_kind is distinct from 'text'::public.message_kind then
    raise exception 'Media messages require trusted byte validation.' using errcode = '42501';
  end if;
  return private.persist_authoritative_message(
    p_conversation_id,
    auth.uid(),
    p_kind,
    p_body,
    p_reply_to_message_id,
    p_client_message_id,
    null
  );
end;
$$;

create or replace function public.forward_message(
  p_source_message_id uuid,
  p_target_conversation_id uuid,
  p_client_message_id uuid default null
)
returns public.messages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  source_message public.messages;
  forwarded_message public.messages;
begin
  select * into source_message
  from public.messages
  where id = p_source_message_id and deleted_at is null;

  if not found
    or source_message.kind = 'system'
    or not private.is_conversation_member(source_message.conversation_id, actor_id, false)
    or not private.can_send_to_conversation(p_target_conversation_id, actor_id) then
    raise exception 'The source or target conversation is unavailable.' using errcode = '42501';
  end if;
  if source_message.kind <> 'text' and not exists (
    select 1 from public.message_attachments
    where message_id = source_message.id and removed_at is null
  ) then
    raise exception 'The source attachment is unavailable.' using errcode = 'P0002';
  end if;

  forwarded_message := private.persist_authoritative_message(
    p_target_conversation_id,
    actor_id,
    source_message.kind,
    source_message.body,
    null,
    p_client_message_id,
    source_message.id
  );

  insert into public.message_attachments (
    message_id, forwarded_from_attachment_id, owner_id, bucket_id, object_path,
    mime_type, byte_size, duration_seconds, waveform, width, height
  )
  select
    forwarded_message.id, attachment.id, attachment.owner_id, attachment.bucket_id,
    attachment.object_path, attachment.mime_type, attachment.byte_size,
    attachment.duration_seconds, attachment.waveform, attachment.width, attachment.height
  from public.message_attachments as attachment
  where attachment.message_id = source_message.id and attachment.removed_at is null
  on conflict (message_id, forwarded_from_attachment_id) do nothing;

  return forwarded_message;
end;
$$;

create or replace function public.send_validated_message_media(
  p_conversation_id uuid,
  p_kind public.message_kind,
  p_body text,
  p_reply_to_message_id uuid,
  p_client_message_id uuid,
  p_owner_id uuid,
  p_object_path text,
  p_mime_type text,
  p_byte_size bigint,
  p_duration_seconds numeric default null,
  p_waveform jsonb default null,
  p_width integer default null,
  p_height integer default null
)
returns public.messages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  message_record public.messages;
  attachment_record public.message_attachments;
begin
  if p_owner_id is null
    or p_client_message_id is null
    or p_conversation_id is null
    or p_object_path is null
    or p_mime_type is null
    or p_byte_size not between 1 and 26214400
    or p_kind not in ('audio', 'image')
    or split_part(p_object_path, '/', 1) <> p_owner_id::text
    or split_part(p_object_path, '/', 2) <> p_conversation_id::text
    or split_part(p_object_path, '/', 3) <> p_client_message_id::text
    or p_object_path like '%..%'
    or (p_kind = 'audio' and p_mime_type not in ('audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav'))
    or (p_kind = 'image' and p_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/avif'))
    or (p_kind = 'audio' and p_duration_seconds is null)
    or (p_kind = 'audio' and (p_waveform is null or jsonb_typeof(p_waveform) <> 'array'))
    or (p_kind = 'image' and (p_width is null or p_height is null)) then
    raise exception 'Invalid validated message media payload.' using errcode = '22023';
  end if;

  -- Serialize with the orphan worker before creating recipient-visible domain rows.
  perform pg_advisory_xact_lock(hashtextextended('chat-media:' || p_object_path, 0));
  if exists (
    select 1 from public.orphan_media_cleanup_claims
    where bucket_id = 'chat-media' and object_path = p_object_path
  ) then
    raise exception 'The uploaded object is already scheduled for cleanup.' using errcode = '55000';
  end if;

  perform 1
  from storage.objects
  where bucket_id = 'chat-media'
    and name = p_object_path
    and (owner_id = p_owner_id::text or split_part(name, '/', 1) = p_owner_id::text)
  for update;
  if not found then
    raise exception 'Validated message Storage object not found.' using errcode = 'P0002';
  end if;

  message_record := private.persist_authoritative_message(
    p_conversation_id,
    p_owner_id,
    p_kind,
    p_body,
    p_reply_to_message_id,
    p_client_message_id,
    null
  );

  select * into attachment_record
  from public.message_attachments
  where message_id = message_record.id and forwarded_from_attachment_id is null
  for update;

  if found then
    if attachment_record.owner_id <> p_owner_id
      or attachment_record.object_path <> p_object_path
      or attachment_record.mime_type <> p_mime_type
      or attachment_record.byte_size <> p_byte_size
      or attachment_record.duration_seconds is distinct from p_duration_seconds
      or attachment_record.waveform is distinct from p_waveform
      or attachment_record.width is distinct from p_width
      or attachment_record.height is distinct from p_height then
      raise exception 'The message already has another attachment.' using errcode = '23505';
    end if;
    return message_record;
  end if;

  insert into public.message_attachments (
    message_id, owner_id, bucket_id, object_path, mime_type, byte_size,
    duration_seconds, waveform, width, height
  ) values (
    message_record.id, p_owner_id, 'chat-media', p_object_path, p_mime_type,
    p_byte_size, p_duration_seconds, p_waveform, p_width, p_height
  );

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (
    p_owner_id,
    'storage.message_media_validated',
    'message',
    message_record.id,
    jsonb_build_object('mime_type', p_mime_type, 'byte_size', p_byte_size)
  );

  return message_record;
end;
$$;

-- Browser roles can reserve/upload, but cannot promote or attach bytes they described themselves.
revoke all on function public.finalize_profile_media(uuid) from authenticated;
revoke all on function public.finalize_post_media(uuid) from authenticated;
revoke insert, delete on public.message_attachments from authenticated;

create or replace function private.storage_object_has_metadata(
  p_bucket_id text,
  p_object_path text,
  p_owner_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_owner_id is null
    or split_part(p_object_path, '/', 1) <> p_owner_id
    or exists (
      select 1 from public.profile_media
      where bucket_id = p_bucket_id and object_path = p_object_path
    )
    or exists (
      select 1 from public.post_media
      where bucket_id = p_bucket_id and object_path = p_object_path
    )
    or exists (
      select 1 from public.community_branding_media
      where bucket_id = p_bucket_id and object_path = p_object_path
    )
    or exists (
      select 1 from public.community_branding_cleanup
      where bucket_id = p_bucket_id and object_path = p_object_path
    )
    or exists (
      select 1 from public.communities
      where p_bucket_id = 'community-media' and p_object_path in (avatar_path, cover_path)
    )
    or exists (
      select 1 from public.message_attachments
      where bucket_id = p_bucket_id and object_path = p_object_path
    )
    or exists (
      select 1 from public.report_evidence
      where bucket_id = p_bucket_id and object_path = p_object_path
    )
    or exists (
      select 1 from public.account_export_artifacts
      where bucket_id = p_bucket_id and object_path = p_object_path
    )
    or private.report_target_attachment_is_retained(p_bucket_id, p_object_path);
$$;

create or replace function public.list_orphan_media_upload_cleanup(p_limit integer default 100)
returns table (bucket_id text, object_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select object.bucket_id, object.name
  from storage.objects as object
  where object.bucket_id in ('profile-media', 'community-media', 'chat-media', 'account-exports')
    and object.created_at < timezone('utc', now()) - interval '1 hour'
    and not private.storage_object_has_metadata(
      object.bucket_id,
      object.name,
      coalesce(object.owner_id, split_part(object.name, '/', 1))
    )
  order by object.created_at, object.id
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

create or replace function public.claim_orphan_media_upload_cleanup(
  p_bucket_id text,
  p_object_path text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  object_owner text;
begin
  if p_bucket_id not in ('profile-media', 'community-media', 'chat-media', 'account-exports')
    or p_object_path is null then
    raise exception 'Invalid orphan cleanup target.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_bucket_id || ':' || p_object_path, 0));
  select coalesce(owner_id, split_part(name, '/', 1)) into object_owner
  from storage.objects
  where bucket_id = p_bucket_id
    and name = p_object_path
    and created_at < timezone('utc', now()) - interval '1 hour'
  for update;

  if not found
    or private.storage_object_has_metadata(p_bucket_id, p_object_path, object_owner) then
    return false;
  end if;

  insert into public.orphan_media_cleanup_claims (bucket_id, object_path)
  values (p_bucket_id, p_object_path)
  on conflict (bucket_id, object_path) do update
  set claimed_at = timezone('utc', now());
  return true;
end;
$$;

create or replace function public.complete_orphan_media_upload_cleanup(
  p_bucket_id text,
  p_object_path text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_bucket_id || ':' || p_object_path, 0));
  if not exists (
    select 1 from public.orphan_media_cleanup_claims
    where bucket_id = p_bucket_id and object_path = p_object_path
  ) then
    raise exception 'Orphan cleanup claim not found.' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from storage.objects
    where bucket_id = p_bucket_id and name = p_object_path
  ) then
    raise exception 'Remove the orphan object before completing cleanup.' using errcode = '55000';
  end if;
  delete from public.orphan_media_cleanup_claims
  where bucket_id = p_bucket_id and object_path = p_object_path;
end;
$$;

create or replace function public.list_orphan_media_cleanup_reconciliation(p_limit integer default 100)
returns table (bucket_id text, object_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select claim.bucket_id, claim.object_path
  from public.orphan_media_cleanup_claims as claim
  where not exists (
    select 1 from storage.objects as object
    where object.bucket_id = claim.bucket_id and object.name = claim.object_path
  )
  order by claim.claimed_at, claim.bucket_id, claim.object_path
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

revoke all on function private.storage_object_has_metadata(text, text, text) from public, anon;
grant execute on function private.storage_object_has_metadata(text, text, text) to authenticated, service_role;

-- Browser uploads are immutable (all clients use upsert=false). Chat deletion is worker-only to
-- remove the race between object rollback and an atomic message+attachment commit. Browser
-- deletion remains available only for genuinely unreferenced profile/community upload attempts.
drop policy if exists "ORHA owners can update their media" on storage.objects;
drop policy if exists "ORHA owners can delete their media" on storage.objects;
create policy "ORHA owners can delete orphaned uploads"
on storage.objects for delete to authenticated
using (
  owner_id = (select auth.uid())::text
  and bucket_id in ('profile-media', 'community-media')
  and private.account_access_enabled((select auth.uid()))
  and not private.storage_object_has_metadata(bucket_id, name, (select auth.uid())::text)
);

drop policy if exists "ORHA users can read permitted private media" on storage.objects;
create policy "ORHA users can read permitted private media"
on storage.objects for select to authenticated
using (
  private.can_read_storage_object(bucket_id, name, (select auth.uid()))
  or (
    private.is_moderator((select auth.uid()))
    and private.report_target_attachment_is_retained(bucket_id, name)
  )
);

-- Recreate upload policies so a pending deactivate/delete request closes the Storage race before
-- the worker inventories objects.
drop policy if exists "ORHA authenticated users can upload owned media" on storage.objects;
create policy "ORHA authenticated users can upload owned media"
on storage.objects for insert to authenticated
with check (
  private.account_access_enabled((select auth.uid()))
  and bucket_id in ('profile-media', 'community-media', 'chat-media')
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (
    (
      bucket_id = 'profile-media'
      and private.effective_profile_account_status((select auth.uid())) = 'active'
      and storage.extension(name) in ('jpg', 'jpeg', 'png', 'webp', 'avif')
      and exists (
        select 1 from public.profile_media
        where profile_id = (select auth.uid())
          and bucket_id = 'profile-media'
          and object_path = name
          and status = 'pending'
      )
    )
    or (
      bucket_id = 'community-media'
      and private.is_socially_active((select auth.uid()))
      and storage.extension(name) in ('jpg', 'jpeg', 'png', 'webp', 'avif', 'mp4')
      and (
        exists (
          select 1 from public.post_media
          where owner_id = (select auth.uid())
            and bucket_id = 'community-media'
            and object_path = name
            and status = 'pending'
        )
        or exists (
          select 1 from public.community_branding_media
          where owner_id = (select auth.uid())
            and bucket_id = 'community-media'
            and object_path = name
            and status = 'pending'
        )
      )
    )
    or (
      bucket_id = 'chat-media'
      and private.is_socially_active((select auth.uid()))
      and storage.extension(name) in ('jpg', 'jpeg', 'png', 'webp', 'avif', 'webm', 'm4a', 'mp3', 'ogg', 'wav')
      and array_length(storage.foldername(name), 1) >= 3
    )
  )
);

drop policy if exists "ORHA reporters can upload evidence" on storage.objects;
create policy "ORHA reporters can upload evidence"
on storage.objects for insert to authenticated
with check (
  private.account_access_enabled((select auth.uid()))
  and private.effective_profile_account_status((select auth.uid())) = 'active'
  and bucket_id = 'report-evidence'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and storage.extension(name) in ('jpg', 'jpeg', 'png', 'webp')
  and exists (
    select 1
    from public.report_evidence as evidence
    join public.reports as report on report.id = evidence.report_id
    where evidence.uploader_id = (select auth.uid())
      and evidence.bucket_id = 'report-evidence'
      and evidence.object_path = name
      and evidence.status = 'pending'
      and report.id::text = (storage.foldername(name))[2]
      and report.reporter_id = (select auth.uid())
      and report.status in ('open', 'in_review')
  )
);

-- Reporters can inspect queue metadata but never the immutable moderation snapshot or its retained
-- attachment references. Moderators use the audited RPC projections below.
revoke select on public.reports from authenticated;
grant select (
  id, reporter_id, target_type, target_id, category, details, status,
  assigned_to, resolution, created_at, updated_at, resolved_at
) on public.reports to authenticated;

revoke all on function private.enforce_report_snapshot_immutability() from public, anon, authenticated;
revoke all on function private.reject_report_target_attachment_update() from public, anon, authenticated;
revoke all on function private.capture_report_target_snapshot(uuid, public.report_target_type, uuid, uuid) from public, anon, authenticated;
revoke all on function private.report_target_attachment_is_retained(text, text, timestamptz) from public, anon;
grant execute on function private.report_target_attachment_is_retained(text, text, timestamptz) to authenticated, service_role;

revoke all on function public.claim_account_lifecycle_request(public.account_lifecycle_kind, uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_account_lifecycle_request(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fail_account_lifecycle_request(uuid, text) from public, anon, authenticated;
revoke all on function public.record_account_lifecycle_retry(uuid, text) from public, anon, authenticated;
revoke all on function public.create_account_export_artifact(uuid, uuid, text, bigint, text, timestamptz) from public, anon, authenticated;
revoke all on function public.list_account_export_cleanup(integer) from public, anon, authenticated;
revoke all on function public.complete_account_export_cleanup(uuid) from public, anon, authenticated;
revoke all on function public.list_user_storage_objects(uuid) from public, anon, authenticated;
revoke all on function public.record_account_deletion_started(uuid, integer) from public, anon, authenticated;
revoke all on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
revoke all on function public.list_account_deletion_reconciliation(integer) from public, anon, authenticated;
revoke all on function public.record_account_deletion_completed(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.finalize_validated_profile_media(uuid, uuid) from public, anon, authenticated;
revoke all on function public.finalize_validated_post_media(uuid, uuid) from public, anon, authenticated;
revoke all on function public.reserve_community_branding_media(uuid, text, text, text, bigint, integer, integer) from public, anon;
revoke all on function public.finalize_validated_community_branding(uuid, uuid) from public, anon, authenticated;
revoke all on function public.reject_community_branding_validation(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.list_community_branding_cleanup(integer) from public, anon, authenticated;
revoke all on function public.complete_community_branding_cleanup(text, uuid) from public, anon, authenticated;
revoke all on function public.reserve_report_evidence(uuid, text, text, bigint) from public, anon;
revoke all on function public.finalize_validated_report_evidence(uuid, uuid) from public, anon, authenticated;
revoke all on function public.reject_report_evidence_validation(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.list_report_evidence_cleanup(integer) from public, anon, authenticated;
revoke all on function public.complete_report_evidence_cleanup(uuid) from public, anon, authenticated;
revoke all on function public.reject_media_validation(text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.persist_authoritative_message(uuid, uuid, public.message_kind, text, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.send_validated_message_media(uuid, public.message_kind, text, uuid, uuid, uuid, text, text, bigint, numeric, jsonb, integer, integer) from public, anon, authenticated;
revoke all on function public.list_orphan_media_upload_cleanup(integer) from public, anon, authenticated;
revoke all on function public.claim_orphan_media_upload_cleanup(text, text) from public, anon, authenticated;
revoke all on function public.complete_orphan_media_upload_cleanup(text, text) from public, anon, authenticated;
revoke all on function public.list_orphan_media_cleanup_reconciliation(integer) from public, anon, authenticated;
revoke all on function public.list_report_target_attachment_cleanup(integer) from public, anon, authenticated;
revoke all on function public.complete_report_target_attachment_cleanup(uuid) from public, anon, authenticated;
revoke all on function public.is_report_target_attachment_retained(text, text) from public, anon, authenticated;

grant execute on function public.claim_account_lifecycle_request(public.account_lifecycle_kind, uuid, uuid) to service_role;
grant execute on function public.complete_account_lifecycle_request(uuid, jsonb) to service_role;
grant execute on function public.fail_account_lifecycle_request(uuid, text) to service_role;
grant execute on function public.record_account_lifecycle_retry(uuid, text) to service_role;
grant execute on function public.create_account_export_artifact(uuid, uuid, text, bigint, text, timestamptz) to service_role;
grant execute on function public.list_account_export_cleanup(integer) to service_role;
grant execute on function public.complete_account_export_cleanup(uuid) to service_role;
grant execute on function public.list_user_storage_objects(uuid) to service_role;
grant execute on function public.record_account_deletion_started(uuid, integer) to service_role;
grant execute on function public.prepare_account_deletion(uuid) to service_role;
grant execute on function public.list_account_deletion_reconciliation(integer) to service_role;
grant execute on function public.record_account_deletion_completed(uuid, uuid, integer) to service_role;
grant execute on function public.finalize_validated_profile_media(uuid, uuid) to service_role;
grant execute on function public.finalize_validated_post_media(uuid, uuid) to service_role;
grant execute on function public.reserve_community_branding_media(uuid, text, text, text, bigint, integer, integer) to authenticated;
grant execute on function public.finalize_validated_community_branding(uuid, uuid) to service_role;
grant execute on function public.reject_community_branding_validation(uuid, uuid, text) to service_role;
grant execute on function public.list_community_branding_cleanup(integer) to service_role;
grant execute on function public.complete_community_branding_cleanup(text, uuid) to service_role;
grant execute on function public.reserve_report_evidence(uuid, text, text, bigint) to authenticated;
grant execute on function public.finalize_validated_report_evidence(uuid, uuid) to service_role;
grant execute on function public.reject_report_evidence_validation(uuid, uuid, text) to service_role;
grant execute on function public.list_report_evidence_cleanup(integer) to service_role;
grant execute on function public.complete_report_evidence_cleanup(uuid) to service_role;
grant execute on function public.reject_media_validation(text, uuid, uuid, text) to service_role;
grant execute on function public.send_validated_message_media(uuid, public.message_kind, text, uuid, uuid, uuid, text, text, bigint, numeric, jsonb, integer, integer) to service_role;
grant execute on function public.list_orphan_media_upload_cleanup(integer) to service_role;
grant execute on function public.claim_orphan_media_upload_cleanup(text, text) to service_role;
grant execute on function public.complete_orphan_media_upload_cleanup(text, text) to service_role;
grant execute on function public.list_orphan_media_cleanup_reconciliation(integer) to service_role;
grant execute on function public.list_report_target_attachment_cleanup(integer) to service_role;
grant execute on function public.complete_report_target_attachment_cleanup(uuid) to service_role;
grant execute on function public.is_report_target_attachment_retained(text, text) to service_role;

comment on table public.account_export_artifacts is 'Private, expiring account-data artifacts. Only a trusted Edge Function uploads and signs them.';
comment on function public.claim_account_lifecycle_request(public.account_lifecycle_kind, uuid, uuid) is 'Service-role-only SKIP LOCKED queue claim with stale-worker recovery.';
comment on function public.send_validated_message_media(uuid, public.message_kind, text, uuid, uuid, uuid, text, text, bigint, numeric, jsonb, integer, integer) is 'Service-role-only atomic media message, attachment, receipts, and notification commit after Edge byte validation.';

do $$
declare
  rls_enabled boolean;
  tombstone_rls_enabled boolean;
  branding_rls_enabled boolean;
  report_attachment_rls_enabled boolean;
begin
  select relrowsecurity into rls_enabled
  from pg_class
  where oid = 'public.account_export_artifacts'::regclass;

  select relrowsecurity into tombstone_rls_enabled
  from pg_class
  where oid = 'public.account_deletion_tombstones'::regclass;

  select relrowsecurity into branding_rls_enabled
  from pg_class
  where oid = 'public.community_branding_media'::regclass;

  select relrowsecurity into report_attachment_rls_enabled
  from pg_class
  where oid = 'public.report_target_attachments'::regclass;

  if not coalesce(rls_enabled, false)
    or not coalesce(tombstone_rls_enabled, false)
    or not coalesce(branding_rls_enabled, false)
    or not coalesce(report_attachment_rls_enabled, false)
    or to_regprocedure('public.claim_account_lifecycle_request(public.account_lifecycle_kind,uuid,uuid)') is null
    or to_regprocedure('public.complete_account_lifecycle_request(uuid,jsonb)') is null
    or to_regprocedure('public.fail_account_lifecycle_request(uuid,text)') is null
    or to_regprocedure('public.list_account_deletion_reconciliation(integer)') is null
    or to_regprocedure('public.prepare_account_deletion(uuid)') is null
    or to_regprocedure('public.finalize_validated_profile_media(uuid,uuid)') is null
    or to_regprocedure('public.finalize_validated_post_media(uuid,uuid)') is null
    or to_regprocedure('public.finalize_validated_community_branding(uuid,uuid)') is null
    or to_regprocedure('public.send_validated_message_media(uuid,public.message_kind,text,uuid,uuid,uuid,text,text,bigint,numeric,jsonb,integer,integer)') is null
    or to_regprocedure('private.capture_report_target_snapshot(uuid,public.report_target_type,uuid,uuid)') is null
    or to_regprocedure('public.list_report_target_attachment_cleanup(integer)') is null
    or to_regprocedure('public.complete_report_target_attachment_cleanup(uuid)') is null
    or to_regprocedure('public.list_orphan_media_cleanup_reconciliation(integer)') is null
    or not exists (select 1 from storage.buckets where id = 'account-exports' and public is false)
    or exists (
      select 1 from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = 'ORHA owners can update their media'
    )
    or not exists (
      select 1 from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = 'ORHA owners can delete orphaned uploads'
    )
    or not exists (
      select 1 from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = 'ORHA authenticated users can upload owned media'
        and with_check like '%account_access_enabled%'
    )
    or not exists (
      select 1 from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname = 'ORHA users can read permitted private media'
        and qual like '%report_target_attachment_is_retained%'
    )
    or has_column_privilege('authenticated', 'public.reports', 'target_snapshot', 'SELECT')
    or has_column_privilege('authenticated', 'public.reports', 'target_owner_id', 'SELECT')
    or has_function_privilege('authenticated', 'public.finalize_profile_media(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.finalize_post_media(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.finalize_validated_profile_media(uuid,uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.finalize_validated_post_media(uuid,uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.finalize_validated_community_branding(uuid,uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.prepare_account_deletion(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.send_validated_message_media(uuid,public.message_kind,text,uuid,uuid,uuid,text,text,bigint,numeric,jsonb,integer,integer)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.list_report_target_attachment_cleanup(integer)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.finalize_validated_profile_media(uuid,uuid)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.finalize_validated_post_media(uuid,uuid)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.finalize_validated_community_branding(uuid,uuid)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.prepare_account_deletion(uuid)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.send_validated_message_media(uuid,public.message_kind,text,uuid,uuid,uuid,text,text,bigint,numeric,jsonb,integer,integer)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.list_report_target_attachment_cleanup(integer)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.complete_report_target_attachment_cleanup(uuid)', 'EXECUTE')
    or exists (
      select 1 from storage.buckets
      where id = 'chat-media' and 'application/pdf' = any(allowed_mime_types)
    ) then
    raise exception 'Edge worker hardening postconditions are incomplete.' using errcode = '55000';
  end if;
end
$$;
