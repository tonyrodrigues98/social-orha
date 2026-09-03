-- ORHA launch social schema.
-- Forward-only: requires 20260811040000_auth_and_onboarding_foundation.sql and
-- 20260816130000_security_privacy_hardening.sql. Never apply this file alone.
-- Transaction-safe: contains no transaction control, concurrent indexes, or external side effects.
-- Run once through the migration ledger inside a single transaction; a failed run can be retried after rollback.

do $$
begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.profile_details') is null
    or to_regclass('public.profile_privacy') is null
    or to_regclass('public.user_roles') is null
    or to_regclass('public.friendships') is null
    or to_regprocedure('public.get_visible_profiles(uuid,integer,integer)') is null then
    raise exception 'ORHA auth/onboarding and privacy hardening migrations must be applied first.' using errcode = '55000';
  end if;

  if to_regclass('public.blocks') is not null
    or to_regclass('public.communities') is not null
    or to_regclass('public.conversations') is not null
    or to_regclass('public.reports') is not null then
    raise exception 'ORHA social launch schema already exists; do not replay this forward-only migration.' using errcode = '55000';
  end if;

  if to_regclass('storage.buckets') is null
    or to_regclass('storage.objects') is null
    or not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'Required Supabase Storage or Realtime publication infrastructure is unavailable.' using errcode = '55000';
  end if;

  -- `realtime.messages` is vendor-managed on hosted Supabase. Creating it from an
  -- application migration is unsupported and the realtime schema is intentionally locked.
  -- Enable/resume Realtime through the Dashboard or Management API, wait for the service
  -- migration to create the table, and then retry this transaction.
  if to_regclass('realtime.messages') is null then
    raise exception 'Supabase Realtime is not initialized: vendor-managed realtime.messages is missing. Enable/resume Realtime through the official service before retrying; do not create it manually.' using errcode = '55000';
  end if;
end
$$;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- The hardening migration adds these checks as NOT VALID to avoid an unsafe blind scan.
-- Production must run the read-only legacy audit first; validation then fails atomically on any violation.
alter table public.profiles
  validate constraint profiles_avatar_path_payload_limit;

alter table public.profile_details
  validate constraint profile_details_favorite_season_payload_limit;
alter table public.profile_details
  validate constraint profile_details_social_energy_payload_limit;
alter table public.profile_details
  validate constraint profile_details_personality_payload_limit;
alter table public.profile_details
  validate constraint profile_details_weekend_payload_limit;
alter table public.profile_details
  validate constraint profile_details_visited_places_payload_limit;
alter table public.profile_details
  validate constraint profile_details_desired_places_payload_limit;
alter table public.profile_details
  validate constraint profile_details_interests_payload_limit;
alter table public.profile_details
  validate constraint profile_details_hobbies_payload_limit;
alter table public.profile_details
  validate constraint profile_details_movies_payload_limit;
alter table public.profile_details
  validate constraint profile_details_series_payload_limit;
alter table public.profile_details
  validate constraint profile_details_songs_payload_limit;
alter table public.profile_details
  validate constraint profile_details_artists_payload_limit;
alter table public.profile_details
  validate constraint profile_details_books_payload_limit;
alter table public.profile_details
  validate constraint profile_details_games_payload_limit;

do $$
begin
  create type public.profile_account_status as enum ('active', 'restricted', 'suspended', 'banned');
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.account_lifecycle_kind as enum ('data_export', 'deactivate', 'delete');
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.account_lifecycle_status as enum ('pending', 'processing', 'completed', 'cancelled', 'failed');
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.profile_media_purpose as enum ('avatar', 'cover', 'gallery');
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.media_processing_status as enum ('pending', 'ready', 'deleting', 'failed');
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.community_visibility as enum ('public', 'private');
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.community_role as enum ('owner', 'moderator', 'member');
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.community_membership_status as enum ('pending', 'active', 'banned', 'left');
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.content_visibility as enum ('public', 'friends', 'community', 'private');
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.content_status as enum ('active', 'hidden', 'removed');
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.reaction_kind as enum ('like', 'love', 'amen', 'pray', 'support');
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.conversation_kind as enum ('direct', 'group');
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.conversation_member_role as enum ('owner', 'admin', 'member');
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.conversation_member_status as enum ('invited', 'active', 'left', 'removed');
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.conversation_request_status as enum ('pending', 'accepted', 'declined', 'cancelled');
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.message_kind as enum ('text', 'audio', 'image', 'file', 'system');
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.report_target_type as enum ('profile', 'community', 'community_post', 'post_comment', 'message');
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.report_status as enum ('open', 'in_review', 'resolved', 'dismissed');
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.moderation_action_type as enum (
    'warn',
    'hide_content',
    'remove_content',
    'restrict',
    'suspend',
    'ban',
    'dismiss'
  );
exception when duplicate_object then null;
end
$$;

create table public.profile_moderation_state (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  status public.profile_account_status not null default 'active',
  public_reason text,
  restricted_until timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profile_moderation_reason_length check (public_reason is null or char_length(public_reason) <= 500),
  constraint profile_moderation_expiry_consistency check (
    restricted_until is null or status in ('restricted', 'suspended')
  )
);

create table public.notification_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  social_enabled boolean not null default true,
  messages_enabled boolean not null default true,
  community_enabled boolean not null default true,
  system_enabled boolean not null default true,
  email_enabled boolean not null default true,
  push_enabled boolean not null default false,
  quiet_hours_start time,
  quiet_hours_end time,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint notification_preferences_quiet_hours_pair check (
    (quiet_hours_start is null and quiet_hours_end is null)
    or (quiet_hours_start is not null and quiet_hours_end is not null)
  )
);

create table public.user_settings (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  locale text not null default 'pt-BR',
  timezone_name text not null default 'America/Sao_Paulo',
  reduced_motion boolean not null default false,
  high_contrast boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_settings_locale_format check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  constraint user_settings_timezone_length check (char_length(timezone_name) between 3 and 80)
);

create table public.account_lifecycle_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind public.account_lifecycle_kind not null,
  status public.account_lifecycle_status not null default 'pending',
  requested_at timestamptz not null default timezone('utc', now()),
  execute_after timestamptz not null,
  cancelled_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint account_lifecycle_terminal_timestamps check (
    (status = 'cancelled' and cancelled_at is not null and completed_at is null)
    or (status = 'completed' and completed_at is not null and cancelled_at is null)
    or (status in ('pending', 'processing', 'failed') and cancelled_at is null and completed_at is null)
  ),
  constraint account_lifecycle_execute_order check (execute_after >= requested_at)
);

create unique index account_lifecycle_one_open_kind
on public.account_lifecycle_requests (user_id, kind)
where status in ('pending', 'processing');

create index account_lifecycle_due_idx
on public.account_lifecycle_requests (status, execute_after)
where status in ('pending', 'processing');

create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint blocks_distinct_people check (blocker_id <> blocked_id),
  constraint blocks_reason_length check (reason is null or char_length(reason) <= 300),
  constraint blocks_unique unique (blocker_id, blocked_id)
);

create index blocks_blocked_idx on public.blocks (blocked_id, blocker_id);

create table public.profile_media (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  purpose public.profile_media_purpose not null,
  bucket_id text not null default 'profile-media',
  object_path text not null,
  mime_type text not null,
  byte_size bigint not null,
  width integer not null,
  height integer not null,
  sort_order smallint not null default 0,
  status public.media_processing_status not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profile_media_bucket check (bucket_id = 'profile-media'),
  constraint profile_media_object_path_length check (char_length(object_path) between 38 and 300),
  constraint profile_media_owner_path check (split_part(object_path, '/', 1) = profile_id::text),
  constraint profile_media_mime check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
  constraint profile_media_size check (byte_size between 1 and 10485760),
  constraint profile_media_dimensions check (width between 1 and 12000 and height between 1 and 12000),
  constraint profile_media_sort_order check (sort_order between 0 and 8),
  constraint profile_media_object_unique unique (bucket_id, object_path)
);

create unique index profile_media_one_ready_avatar_or_cover
on public.profile_media (profile_id, purpose)
where purpose in ('avatar', 'cover') and status = 'ready';

create unique index profile_media_one_pending_avatar_or_cover
on public.profile_media (profile_id, purpose)
where purpose in ('avatar', 'cover') and status = 'pending';

create index profile_media_profile_ready_idx
on public.profile_media (profile_id, purpose, sort_order)
where status = 'ready';

create table public.communities (
  id uuid primary key default gen_random_uuid(),
  slug extensions.citext not null unique,
  name text not null,
  description text not null default '',
  category text not null default 'general',
  owner_id uuid references public.profiles(id) on delete set null,
  visibility public.community_visibility not null default 'public',
  avatar_path text,
  cover_path text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz,
  constraint communities_slug_format check (slug::text ~ '^[a-z0-9][a-z0-9-]{2,47}$'),
  constraint communities_name_length check (char_length(name) between 3 and 100),
  constraint communities_description_length check (char_length(description) <= 2000),
  constraint communities_category_format check (category ~ '^[a-z][a-z0-9_]{1,39}$'),
  constraint communities_avatar_path_length check (avatar_path is null or char_length(avatar_path) <= 300),
  constraint communities_cover_path_length check (cover_path is null or char_length(cover_path) <= 300)
);

create index communities_visibility_created_idx on public.communities (visibility, created_at desc) where archived_at is null;
create index communities_category_visibility_idx on public.communities (category, visibility, created_at desc) where archived_at is null;

create table public.community_memberships (
  community_id uuid not null references public.communities(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.community_role not null default 'member',
  status public.community_membership_status not null default 'pending',
  joined_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (community_id, profile_id),
  constraint community_membership_joined_consistency check (
    (status = 'active' and joined_at is not null) or status <> 'active'
  )
);

create index community_memberships_profile_status_idx on public.community_memberships (profile_id, status);

create table public.community_rules (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  title text not null,
  description text not null,
  sort_order smallint not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint community_rules_title_length check (char_length(btrim(title)) between 2 and 100),
  constraint community_rules_description_length check (char_length(btrim(description)) between 2 and 1000),
  constraint community_rules_sort_order check (sort_order between 0 and 49),
  constraint community_rules_order_unique unique (community_id, sort_order) deferrable initially immediate
);

create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles(id) on delete set null,
  community_id uuid references public.communities(id) on delete cascade,
  body text not null,
  visibility public.content_visibility not null default 'public',
  status public.content_status not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint community_posts_body_length check (char_length(btrim(body)) between 1 and 10000),
  constraint community_posts_visibility check (
    (community_id is null and visibility <> 'community')
    or (community_id is not null and visibility in ('public', 'community'))
  )
);

create index community_posts_feed_idx on public.community_posts (created_at desc) where status = 'active';
create index community_posts_community_feed_idx on public.community_posts (community_id, created_at desc) where status = 'active';
create index community_posts_author_feed_idx on public.community_posts (author_id, created_at desc) where status = 'active';

create table public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  bucket_id text not null default 'community-media',
  object_path text not null,
  mime_type text not null,
  byte_size bigint not null,
  width integer,
  height integer,
  sort_order smallint not null default 0,
  status public.media_processing_status not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint post_media_bucket check (bucket_id = 'community-media'),
  constraint post_media_owner_path check (split_part(object_path, '/', 1) = owner_id::text),
  constraint post_media_path_length check (char_length(object_path) between 38 and 300),
  constraint post_media_mime check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4')),
  constraint post_media_size check (byte_size between 1 and 26214400),
  constraint post_media_dimensions check (
    (width is null and height is null)
    or (width between 1 and 12000 and height between 1 and 12000)
  ),
  constraint post_media_sort_order check (sort_order between 0 and 5),
  constraint post_media_object_unique unique (bucket_id, object_path)
);

create unique index post_media_post_order_active_unique
on public.post_media (post_id, sort_order)
where status in ('pending', 'ready');

create index post_media_cleanup_idx
on public.post_media (updated_at, id)
where status in ('pending', 'deleting', 'failed');

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  parent_comment_id uuid references public.post_comments(id) on delete cascade,
  body text not null,
  status public.content_status not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint post_comments_body_length check (char_length(btrim(body)) between 1 and 3000)
);

create index post_comments_post_created_idx on public.post_comments (post_id, created_at) where status = 'active';
create index post_comments_parent_idx on public.post_comments (parent_comment_id) where parent_comment_id is not null;

create table public.post_reactions (
  id uuid primary key default gen_random_uuid(),
  reactor_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid references public.community_posts(id) on delete cascade,
  comment_id uuid references public.post_comments(id) on delete cascade,
  kind public.reaction_kind not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint post_reactions_exactly_one_target check (num_nonnulls(post_id, comment_id) = 1)
);

create unique index post_reactions_unique_post
on public.post_reactions (reactor_id, post_id)
where post_id is not null;

create unique index post_reactions_unique_comment
on public.post_reactions (reactor_id, comment_id)
where comment_id is not null;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind public.conversation_kind not null,
  title text,
  created_by uuid references public.profiles(id) on delete set null,
  direct_user_low uuid references public.profiles(id) on delete cascade,
  direct_user_high uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint conversations_title_length check (title is null or char_length(title) between 1 and 100),
  constraint conversations_direct_shape check (
    (kind = 'direct' and title is null and direct_user_low is not null and direct_user_high is not null and direct_user_low < direct_user_high)
    or (kind = 'group' and title is not null and direct_user_low is null and direct_user_high is null)
  )
);

create unique index conversations_unique_direct_pair
on public.conversations (direct_user_low, direct_user_high)
where kind = 'direct';

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.conversation_member_role not null default 'member',
  status public.conversation_member_status not null default 'invited',
  joined_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (conversation_id, profile_id),
  constraint conversation_member_joined_consistency check (
    (status = 'active' and joined_at is not null) or status <> 'active'
  )
);

create index conversation_members_profile_status_idx on public.conversation_members (profile_id, status);

create table public.conversation_preferences (
  conversation_id uuid not null,
  profile_id uuid not null,
  muted_until timestamptz,
  archived_at timestamptz,
  notifications_enabled boolean not null default true,
  read_receipts_enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (conversation_id, profile_id),
  foreign key (conversation_id, profile_id)
    references public.conversation_members(conversation_id, profile_id)
    on delete cascade
);

create table public.conversation_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  opening_message text,
  status public.conversation_request_status not null default 'pending',
  conversation_id uuid references public.conversations(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  responded_at timestamptz,
  constraint conversation_requests_distinct_people check (requester_id <> recipient_id),
  constraint conversation_requests_message_length check (opening_message is null or char_length(opening_message) <= 1000),
  constraint conversation_requests_response_consistency check (
    (status = 'pending' and responded_at is null)
    or (status <> 'pending' and responded_at is not null)
  )
);

create unique index conversation_requests_one_pending_pair
on public.conversation_requests (
  least(requester_id, recipient_id),
  greatest(requester_id, recipient_id)
)
where status = 'pending';

create index conversation_requests_recipient_idx on public.conversation_requests (recipient_id, status, created_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  client_message_id uuid,
  kind public.message_kind not null default 'text',
  body text,
  reply_to_message_id uuid references public.messages(id) on delete set null,
  forwarded_from_message_id uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  edited_at timestamptz,
  deleted_at timestamptz,
  constraint messages_body_length check (body is null or char_length(body) <= 5000),
  constraint messages_content_shape check (
    deleted_at is not null
    or (kind = 'text' and body is not null and char_length(btrim(body)) > 0)
    or (kind <> 'text')
  )
);

create index messages_conversation_created_idx on public.messages (conversation_id, created_at desc);
create index messages_sender_created_idx on public.messages (sender_id, created_at desc) where sender_id is not null;
create unique index messages_client_idempotency
on public.messages (conversation_id, sender_id, client_message_id)
where client_message_id is not null and sender_id is not null;

create table public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  reactor_id uuid not null references public.profiles(id) on delete cascade,
  kind public.reaction_kind not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (message_id, reactor_id)
);

create index message_reactions_reactor_idx on public.message_reactions (reactor_id, created_at desc);

create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  forwarded_from_attachment_id uuid references public.message_attachments(id) on delete restrict,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  bucket_id text not null default 'chat-media',
  object_path text not null,
  mime_type text not null,
  byte_size bigint not null,
  duration_seconds numeric(8, 3),
  waveform jsonb,
  width integer,
  height integer,
  removed_at timestamptz,
  cleanup_requested_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint message_attachments_bucket check (bucket_id = 'chat-media'),
  constraint message_attachments_owner_path check (split_part(object_path, '/', 1) = owner_id::text),
  constraint message_attachments_path_length check (char_length(object_path) between 38 and 300),
  constraint message_attachments_mime check (
    mime_type in (
      'image/jpeg', 'image/png', 'image/webp', 'image/avif',
      'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav',
      'application/pdf'
    )
  ),
  constraint message_attachments_size check (byte_size between 1 and 26214400),
  constraint message_attachments_duration check (duration_seconds is null or duration_seconds between 0 and 3600),
  constraint message_attachments_waveform check (
    waveform is null
    or (
      jsonb_typeof(waveform) = 'array'
      and jsonb_array_length(waveform) <= 256
      and octet_length(waveform::text) <= 8192
    )
  ),
  constraint message_attachments_dimensions check (
    (width is null and height is null)
    or (width between 1 and 12000 and height between 1 and 12000)
  ),
  constraint message_attachments_forward_not_self check (forwarded_from_attachment_id is null or forwarded_from_attachment_id <> id),
  constraint message_attachments_cleanup_consistency check (
    cleanup_requested_at is null or removed_at is not null
  ),
  constraint message_attachments_forward_unique unique (message_id, forwarded_from_attachment_id)
);

create index message_attachments_message_idx on public.message_attachments (message_id);
create index message_attachments_cleanup_idx
on public.message_attachments (cleanup_requested_at, id)
where removed_at is not null;
create unique index message_attachments_original_object_unique
on public.message_attachments (bucket_id, object_path)
where forwarded_from_attachment_id is null;

create table public.message_receipts (
  message_id uuid not null references public.messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  delivered_at timestamptz,
  read_at timestamptz,
  primary key (message_id, profile_id),
  constraint message_receipts_order check (
    read_at is null or delivered_at is null or read_at >= delivered_at
  )
);

create index message_receipts_profile_unread_idx on public.message_receipts (profile_id, message_id) where read_at is null;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null,
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint notifications_type_format check (type ~ '^[a-z][a-z0-9_]{1,49}$'),
  constraint notifications_entity_type_format check (entity_type is null or entity_type ~ '^[a-z][a-z0-9_]{1,49}$'),
  constraint notifications_entity_pair check ((entity_type is null) = (entity_id is null)),
  constraint notifications_payload_object check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 8192),
  constraint notifications_dedupe_length check (dedupe_key is null or char_length(dedupe_key) <= 180)
);

create unique index notifications_dedupe_unique
on public.notifications (recipient_id, dedupe_key)
where dedupe_key is not null;

create index notifications_recipient_unread_idx on public.notifications (recipient_id, created_at desc) where read_at is null;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type public.report_target_type not null,
  target_id uuid not null,
  category text not null,
  details text,
  status public.report_status not null default 'open',
  assigned_to uuid references public.profiles(id) on delete set null,
  resolution text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz,
  constraint reports_category_format check (category ~ '^[a-z][a-z0-9_]{1,49}$'),
  constraint reports_details_length check (details is null or char_length(details) <= 2000),
  constraint reports_resolution_length check (resolution is null or char_length(resolution) <= 2000),
  constraint reports_resolution_consistency check (
    (status in ('resolved', 'dismissed') and resolved_at is not null)
    or (status in ('open', 'in_review') and resolved_at is null)
  )
);

create index reports_status_created_idx on public.reports (status, created_at);
create index reports_reporter_created_idx on public.reports (reporter_id, created_at desc);
create index reports_target_idx on public.reports (target_type, target_id, created_at desc);

create table public.report_evidence (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  bucket_id text not null default 'report-evidence',
  object_path text not null,
  mime_type text not null,
  byte_size bigint not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint report_evidence_bucket check (bucket_id = 'report-evidence'),
  constraint report_evidence_owner_path check (split_part(object_path, '/', 1) = uploader_id::text),
  constraint report_evidence_report_path check (split_part(object_path, '/', 2) = report_id::text),
  constraint report_evidence_path_length check (char_length(object_path) between 75 and 360),
  constraint report_evidence_mime check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint report_evidence_size check (byte_size between 1 and 10485760),
  constraint report_evidence_object_unique unique (bucket_id, object_path)
);

create index report_evidence_report_idx on public.report_evidence (report_id, created_at);

create table public.moderation_cases (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null unique references public.reports(id) on delete restrict,
  assigned_to uuid references public.profiles(id) on delete set null,
  status public.report_status not null default 'open',
  priority smallint not null default 2,
  resolution text,
  opened_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz,
  constraint moderation_cases_priority check (priority between 1 and 4),
  constraint moderation_cases_resolution_length check (resolution is null or char_length(resolution) <= 2000),
  constraint moderation_cases_resolution_consistency check (
    (status in ('resolved', 'dismissed') and resolved_at is not null)
    or (status in ('open', 'in_review') and resolved_at is null)
  )
);

create index moderation_cases_status_priority_idx on public.moderation_cases (status, priority, opened_at);

create table public.sanctions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.moderation_cases(id) on delete set null,
  imposed_by uuid references public.profiles(id) on delete set null,
  target_type public.report_target_type not null,
  target_id uuid not null,
  action_type public.moderation_action_type not null,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  starts_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  revoked_reason text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint sanctions_reason_length check (char_length(btrim(reason)) between 3 and 2000),
  constraint sanctions_metadata_object check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384),
  constraint sanctions_expiry_order check (expires_at is null or expires_at > starts_at),
  constraint sanctions_revocation_consistency check (
    (revoked_at is null and revoked_by is null and revoked_reason is null)
    or (revoked_at is not null and revoked_by is not null and char_length(btrim(revoked_reason)) between 3 and 1000)
  )
);

create index sanctions_target_active_idx on public.sanctions (target_type, target_id, created_at desc) where revoked_at is null;
create index sanctions_case_idx on public.sanctions (case_id) where case_id is not null;

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  target_type text,
  target_id uuid,
  request_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint audit_logs_event_format check (event_type ~ '^[a-z][a-z0-9_.]{2,79}$'),
  constraint audit_logs_target_pair check ((target_type is null) = (target_id is null)),
  constraint audit_logs_target_type_format check (target_type is null or target_type ~ '^[a-z][a-z0-9_]{1,49}$'),
  constraint audit_logs_metadata_object check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384)
);

create index audit_logs_target_idx on public.audit_logs (target_type, target_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc) where actor_id is not null;

-- Keep mutable records timestamped without granting browser clients access to audit columns.
do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'profile_moderation_state',
    'notification_preferences',
    'user_settings',
    'account_lifecycle_requests',
    'profile_media',
    'communities',
    'community_memberships',
    'community_rules',
    'community_posts',
    'post_media',
    'post_comments',
    'conversations',
    'conversation_members',
    'conversation_preferences',
    'reports',
    'moderation_cases'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', target_table || '_set_updated_at', target_table);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      target_table || '_set_updated_at',
      target_table
    );
  end loop;
end
$$;

create or replace function private.reject_audit_log_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Audit logs are append-only.' using errcode = '55000';
end;
$$;

create trigger audit_logs_are_append_only
before update or delete on public.audit_logs
for each row execute function private.reject_audit_log_mutation();

-- Auth signup remains atomic across the complete identity foundation.
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

  insert into public.profile_moderation_state (profile_id)
  values (new.id)
  on conflict (profile_id) do nothing;

  insert into public.notification_preferences (profile_id)
  values (new.id)
  on conflict (profile_id) do nothing;

  insert into public.user_settings (profile_id)
  values (new.id)
  on conflict (profile_id) do nothing;

  return new;
end;
$$;

insert into public.profile_moderation_state (profile_id)
select id from public.profiles
on conflict (profile_id) do nothing;

insert into public.notification_preferences (profile_id)
select id from public.profiles
on conflict (profile_id) do nothing;

insert into public.user_settings (profile_id)
select id from public.profiles
on conflict (profile_id) do nothing;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke all on function private.reject_audit_log_mutation() from public, anon, authenticated;

-- Security-definer predicates prevent recursive RLS policies while preserving least privilege.
create or replace function private.effective_profile_account_status(p_actor uuid default auth.uid())
returns public.profile_account_status
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when state.status in ('restricted', 'suspended')
      and state.restricted_until is not null
      and state.restricted_until <= timezone('utc', now())
      then 'active'::public.profile_account_status
    else coalesce(state.status, 'active'::public.profile_account_status)
  end
  from (values (p_actor)) as actor(profile_id)
  left join public.profile_moderation_state as state
    on state.profile_id = actor.profile_id;
$$;

create or replace function private.account_access_enabled(p_actor uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_actor is not null and not exists (
    select 1
    from public.account_lifecycle_requests
    where user_id = p_actor
      and kind in ('deactivate', 'delete')
      and status in ('pending', 'processing')
  );
$$;

create or replace function private.is_moderator(p_actor uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.account_access_enabled(p_actor)
    and private.effective_profile_account_status(p_actor) = 'active'
    and exists (
    select 1
    from public.user_roles
    where user_id = p_actor
      and role in ('super_admin', 'admin', 'moderator')
  );
$$;

create or replace function private.is_socially_active(p_actor uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.account_access_enabled(p_actor)
    and exists (
      select 1
      from public.profiles
      where id = p_actor
        and onboarding_completed_at is not null
    )
    and private.effective_profile_account_status(p_actor) = 'active';
$$;

create or replace function public.get_own_account_status()
returns table (
  effective_status public.profile_account_status,
  recorded_status public.profile_account_status,
  restricted_until timestamptz,
  access_enabled boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.effective_profile_account_status((select auth.uid())),
    coalesce(state.status, 'active'::public.profile_account_status),
    state.restricted_until,
    private.account_access_enabled((select auth.uid()))
  from (values ((select auth.uid()))) as actor(profile_id)
  left join public.profile_moderation_state as state
    on state.profile_id = actor.profile_id
  where actor.profile_id is not null;
$$;

create or replace function public.reconcile_expired_profile_restrictions(p_limit integer default 100)
returns setof public.profile_moderation_state
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  state_record public.profile_moderation_state;
begin
  for state_record in
    with targets as (
      select profile_id
      from public.profile_moderation_state
      where status in ('restricted', 'suspended')
        and restricted_until is not null
        and restricted_until <= timezone('utc', now())
      order by restricted_until, profile_id
      limit least(greatest(coalesce(p_limit, 100), 1), 500)
      for update skip locked
    )
    update public.profile_moderation_state as state
    set status = 'active',
        public_reason = null,
        restricted_until = null
    from targets
    where state.profile_id = targets.profile_id
    returning state.*
  loop
    insert into public.audit_logs (event_type, target_type, target_id, metadata)
    values (
      'moderation.restriction_expired',
      'profile',
      state_record.profile_id,
      '{}'::jsonb
    );
    return next state_record;
  end loop;
end;
$$;

create or replace function private.are_friends(p_first uuid, p_second uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_first is not null
    and p_second is not null
    and exists (
      select 1
      from public.friendships
      where status = 'accepted'
        and (
          (requester_id = p_first and addressee_id = p_second)
          or (requester_id = p_second and addressee_id = p_first)
        )
    );
$$;

create or replace function private.is_blocked_between(p_first uuid, p_second uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_first is not null
    and p_second is not null
    and exists (
      select 1
      from public.blocks
      where (blocker_id = p_first and blocked_id = p_second)
         or (blocker_id = p_second and blocked_id = p_first)
    );
$$;

create or replace function private.is_active_community_member(p_community_id uuid, p_profile_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.account_access_enabled(p_profile_id) and exists (
    select 1
    from public.community_memberships
    where community_id = p_community_id
      and profile_id = p_profile_id
      and status = 'active'
  );
$$;

create or replace function private.can_manage_community(p_community_id uuid, p_profile_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_profile_id is not null and (
    private.is_moderator(p_profile_id)
    or exists (
      select 1
      from public.community_memberships
      where community_id = p_community_id
        and profile_id = p_profile_id
        and status = 'active'
        and role in ('owner', 'moderator')
    )
  );
$$;

create or replace function private.is_conversation_member(
  p_conversation_id uuid,
  p_profile_id uuid default auth.uid(),
  p_include_invited boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.account_access_enabled(p_profile_id) and exists (
    select 1
    from public.conversation_members
    where conversation_id = p_conversation_id
      and profile_id = p_profile_id
      and (
        status = 'active'
        or (p_include_invited and status = 'invited')
      )
  );
$$;

create or replace function private.can_send_to_conversation(p_conversation_id uuid, p_profile_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_socially_active(p_profile_id)
    and private.is_conversation_member(p_conversation_id, p_profile_id, false)
    and not exists (
      select 1
      from public.conversations as conversation
      where conversation.id = p_conversation_id
        and conversation.kind = 'direct'
        and private.is_blocked_between(conversation.direct_user_low, conversation.direct_user_high)
    );
$$;

create or replace function private.can_view_profile(p_target_profile_id uuid, p_viewer_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.account_access_enabled(p_viewer_id)
    and not private.is_blocked_between(p_target_profile_id, p_viewer_id)
    and exists (
      select 1
      from public.profiles as profile
      join public.profile_privacy as privacy on privacy.profile_id = profile.id
      where profile.id = p_target_profile_id
        and (
          profile.id = p_viewer_id
          or (
            profile.onboarding_completed_at is not null
            and (
              privacy.profile_visibility = 'public'
              or (
                privacy.profile_visibility = 'friends'
                and private.are_friends(profile.id, p_viewer_id)
              )
            )
          )
        )
    );
$$;

create or replace function private.can_view_profile_media(
  p_target_profile_id uuid,
  p_purpose public.profile_media_purpose,
  p_viewer_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_target_profile_id = p_viewer_id
    or (
      private.can_view_profile(p_target_profile_id, p_viewer_id)
      and (
        p_purpose <> 'gallery'
        or exists (
          select 1
          from public.profile_privacy
          where profile_id = p_target_profile_id
            and (
              gallery_visibility = 'public'
              or (gallery_visibility = 'friends' and private.are_friends(p_target_profile_id, p_viewer_id))
            )
        )
      )
    );
$$;

create or replace function private.can_view_community_post(p_post_id uuid, p_viewer_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.account_access_enabled(p_viewer_id) and exists (
    select 1
    from public.community_posts as post
    left join public.communities as community on community.id = post.community_id
    where post.id = p_post_id
      and post.status = 'active'
      and (post.author_id is null or not private.is_blocked_between(post.author_id, p_viewer_id))
      and (
        post.author_id = p_viewer_id
        or post.visibility = 'public'
        or (post.visibility = 'friends' and private.are_friends(post.author_id, p_viewer_id))
        or (
          post.visibility = 'community'
          and private.is_active_community_member(post.community_id, p_viewer_id)
        )
        or (post.visibility = 'private' and post.author_id = p_viewer_id)
      )
      and (
        post.community_id is null
        or (
          community.archived_at is null
          and (
            community.visibility = 'public'
            or private.is_active_community_member(post.community_id, p_viewer_id)
          )
        )
      )
  );
$$;

revoke all on function private.effective_profile_account_status(uuid) from public, anon, authenticated;
revoke all on function private.account_access_enabled(uuid) from public, anon, authenticated;
revoke all on function private.is_moderator(uuid) from public, anon, authenticated;
revoke all on function private.is_socially_active(uuid) from public, anon, authenticated;
revoke all on function private.are_friends(uuid, uuid) from public, anon, authenticated;
revoke all on function private.is_blocked_between(uuid, uuid) from public, anon, authenticated;
revoke all on function private.is_active_community_member(uuid, uuid) from public, anon, authenticated;
revoke all on function private.can_manage_community(uuid, uuid) from public, anon, authenticated;
revoke all on function private.is_conversation_member(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function private.can_send_to_conversation(uuid, uuid) from public, anon, authenticated;
revoke all on function private.can_view_profile(uuid, uuid) from public, anon, authenticated;
revoke all on function private.can_view_profile_media(uuid, public.profile_media_purpose, uuid) from public, anon, authenticated;
revoke all on function private.can_view_community_post(uuid, uuid) from public, anon, authenticated;

grant execute on function private.effective_profile_account_status(uuid) to authenticated, service_role;
grant execute on function private.account_access_enabled(uuid) to authenticated, service_role;
grant execute on function private.is_moderator(uuid) to authenticated, service_role;
grant execute on function private.is_socially_active(uuid) to authenticated, service_role;
grant execute on function private.are_friends(uuid, uuid) to authenticated, service_role;
grant execute on function private.is_blocked_between(uuid, uuid) to authenticated, service_role;
grant execute on function private.is_active_community_member(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_manage_community(uuid, uuid) to authenticated, service_role;
grant execute on function private.is_conversation_member(uuid, uuid, boolean) to authenticated, service_role;
grant execute on function private.can_send_to_conversation(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_view_profile(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_view_profile_media(uuid, public.profile_media_purpose, uuid) to authenticated, service_role;
grant execute on function private.can_view_community_post(uuid, uuid) to authenticated, service_role;
revoke all on function public.get_own_account_status() from public, anon;
revoke all on function public.reconcile_expired_profile_restrictions(integer) from public, anon, authenticated;
grant execute on function public.get_own_account_status() to authenticated;
grant execute on function public.reconcile_expired_profile_restrictions(integer) to service_role;

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles for update to authenticated
using (
  id = (select auth.uid())
  and private.account_access_enabled((select auth.uid()))
)
with check (
  id = (select auth.uid())
  and private.account_access_enabled((select auth.uid()))
);

drop policy if exists "Users can update their own profile details" on public.profile_details;
create policy "Users can update their own profile details"
on public.profile_details for update to authenticated
using (
  profile_id = (select auth.uid())
  and private.account_access_enabled((select auth.uid()))
)
with check (
  profile_id = (select auth.uid())
  and private.account_access_enabled((select auth.uid()))
);

drop policy if exists "Users can update their own privacy settings" on public.profile_privacy;
create policy "Users can update their own privacy settings"
on public.profile_privacy for update to authenticated
using (
  profile_id = (select auth.uid())
  and private.account_access_enabled((select auth.uid()))
)
with check (
  profile_id = (select auth.uid())
  and private.account_access_enabled((select auth.uid()))
);

create or replace function private.validate_post_comment_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_post_id uuid;
  grandparent_id uuid;
begin
  if new.parent_comment_id is null then
    return new;
  end if;

  select post_id, parent_comment_id
  into parent_post_id, grandparent_id
  from public.post_comments
  where id = new.parent_comment_id
    and status = 'active';

  if not found or parent_post_id <> new.post_id then
    raise exception 'Parent comment must belong to the same post.' using errcode = '23514';
  end if;

  if grandparent_id is not null then
    raise exception 'Comment threads are limited to one reply level.' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger post_comments_validate_parent
before insert or update of post_id, parent_comment_id on public.post_comments
for each row execute function private.validate_post_comment_parent();

create or replace function private.validate_post_media_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_author_id uuid;
  media_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.post_id::text, 0));

  select author_id into post_author_id
  from public.community_posts
  where id = new.post_id
    and status = 'active';

  if not found or post_author_id is null or post_author_id <> new.owner_id then
    raise exception 'Post media must be owned by the post author.' using errcode = '23514';
  end if;

  select count(*) into media_count
  from public.post_media
  where post_id = new.post_id
    and id <> new.id
    and status in ('pending', 'ready');

  if media_count >= 6 then
    raise exception 'A post can contain at most six media objects.' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger post_media_validate_owner
before insert or update of post_id, owner_id on public.post_media
for each row execute function private.validate_post_media_owner();

create or replace function private.validate_message_attachment_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  message_sender_id uuid;
  message_type public.message_kind;
  source_attachment public.message_attachments;
  source_conversation_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.message_id::text, 0));

  select sender_id, kind into message_sender_id, message_type
  from public.messages
  where id = new.message_id
    and deleted_at is null;

  if not found or message_sender_id is null then
    raise exception 'Message media requires an active sender.' using errcode = '23514';
  end if;

  if new.forwarded_from_attachment_id is null then
    if message_sender_id <> new.owner_id then
      raise exception 'Message media must be owned by the message sender.' using errcode = '23514';
    end if;
  else
    select * into source_attachment
    from public.message_attachments as attachment
    where attachment.id = new.forwarded_from_attachment_id;

    if not found then
      raise exception 'Forwarded source attachment not found.' using errcode = '23514';
    end if;

    select conversation_id into source_conversation_id
    from public.messages
    where id = source_attachment.message_id;

    if auth.uid() <> message_sender_id
      or not private.is_conversation_member(source_conversation_id, auth.uid(), false)
      or source_attachment.owner_id <> new.owner_id
      or source_attachment.bucket_id <> new.bucket_id
      or source_attachment.object_path <> new.object_path
      or source_attachment.mime_type <> new.mime_type
      or source_attachment.byte_size <> new.byte_size
      or source_attachment.duration_seconds is distinct from new.duration_seconds
      or source_attachment.waveform is distinct from new.waveform
      or source_attachment.width is distinct from new.width
      or source_attachment.height is distinct from new.height then
      raise exception 'Forwarded media must reference an authorized immutable source attachment.' using errcode = '23514';
    end if;
  end if;

  if exists (
    select 1 from public.message_attachments
    where message_id = new.message_id
      and id <> new.id
  ) then
    raise exception 'A message can contain only one attachment.' using errcode = '23514';
  end if;

  if (message_type = 'audio') <> (new.mime_type like 'audio/%') then
    raise exception 'Audio messages require audio media and vice versa.' using errcode = '23514';
  end if;

  if message_type = 'image' and new.mime_type not like 'image/%' then
    raise exception 'Image messages require image media.' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger message_attachments_validate_owner
before insert or update of message_id, forwarded_from_attachment_id, owner_id, mime_type on public.message_attachments
for each row execute function private.validate_message_attachment_owner();

create or replace function private.validate_report_evidence_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reporter_id uuid;
  evidence_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.report_id::text, 0));

  select report.reporter_id into reporter_id
  from public.reports as report
  where report.id = new.report_id
    and report.status in ('open', 'in_review');

  if not found or reporter_id <> new.uploader_id then
    raise exception 'Evidence must be uploaded by the report author while the report is open.' using errcode = '23514';
  end if;

  select count(*) into evidence_count
  from public.report_evidence
  where report_id = new.report_id
    and id <> new.id;

  if evidence_count >= 5 then
    raise exception 'A report can contain at most five evidence images.' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger report_evidence_validate_owner
before insert or update of report_id, uploader_id on public.report_evidence
for each row execute function private.validate_report_evidence_owner();

revoke all on function private.validate_post_comment_parent() from public, anon, authenticated;
revoke all on function private.validate_post_media_owner() from public, anon, authenticated;
revoke all on function private.validate_message_attachment_owner() from public, anon, authenticated;
revoke all on function private.validate_report_evidence_owner() from public, anon, authenticated;

-- Privacy-aware server search. Raw profile tables stay owner-only and blocked users are excluded.
create or replace function public.search_visible_profiles(
  search_term text default '',
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
  with input as (
    select
      auth.uid() as viewer_id,
      left(lower(btrim(coalesce(search_term, ''))), 80) as term
  )
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
  join public.profile_privacy as privacy on privacy.profile_id = profile.id
  left join public.profile_details as details on details.profile_id = profile.id
  cross join input
  cross join lateral (
    select private.are_friends(profile.id, input.viewer_id) as is_friend
  ) as friendship
  cross join lateral (
    select
      friendship.is_friend,
      (
        profile.id = input.viewer_id
        or privacy.location_visibility = 'public'
        or (privacy.location_visibility = 'friends' and friendship.is_friend)
      ) as can_view_location,
      (
        profile.id = input.viewer_id
        or privacy.favorites_visibility = 'public'
        or (privacy.favorites_visibility = 'friends' and friendship.is_friend)
      ) as can_view_favorites,
      (
        profile.id = input.viewer_id
        or privacy.gallery_visibility = 'public'
        or (privacy.gallery_visibility = 'friends' and friendship.is_friend)
      ) as can_view_gallery
  ) as access
  where private.account_access_enabled(input.viewer_id)
    and not private.is_blocked_between(profile.id, input.viewer_id)
    and (
      profile.id = input.viewer_id
      or (
        profile.onboarding_completed_at is not null
        and (
          privacy.profile_visibility = 'public'
          or (privacy.profile_visibility = 'friends' and friendship.is_friend)
        )
      )
    )
    and (
      input.term = ''
      or strpos(lower(coalesce(profile.full_name, '')), input.term) > 0
      or strpos(lower(coalesce(profile.username::text, '')), input.term) > 0
      or strpos(lower(array_to_string(coalesce(details.interests, '{}'::text[]), ' ')), input.term) > 0
      or strpos(lower(array_to_string(coalesce(details.hobbies, '{}'::text[]), ' ')), input.term) > 0
    )
  order by
    (profile.id = input.viewer_id) desc,
    (lower(coalesce(profile.username::text, '')) = input.term) desc,
    profile.full_name nulls last,
    profile.id
  limit least(greatest(coalesce(page_size, 20), 1), 50)
  offset least(greatest(coalesce(page_offset, 0), 0), 10000);
$$;

revoke all on function public.search_visible_profiles(text, integer, integer) from public, anon;
grant execute on function public.search_visible_profiles(text, integer, integer) to authenticated;

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
  join public.profile_privacy as privacy on privacy.profile_id = profile.id
  left join public.profile_details as details on details.profile_id = profile.id
  cross join (select auth.uid() as viewer_id) as viewer
  cross join lateral (
    select private.are_friends(profile.id, viewer.viewer_id) as is_friend
  ) as friendship
  cross join lateral (
    select
      friendship.is_friend,
      (
        profile.id = viewer.viewer_id
        or privacy.location_visibility = 'public'
        or (privacy.location_visibility = 'friends' and friendship.is_friend)
      ) as can_view_location,
      (
        profile.id = viewer.viewer_id
        or privacy.favorites_visibility = 'public'
        or (privacy.favorites_visibility = 'friends' and friendship.is_friend)
      ) as can_view_favorites,
      (
        profile.id = viewer.viewer_id
        or privacy.gallery_visibility = 'public'
        or (privacy.gallery_visibility = 'friends' and friendship.is_friend)
      ) as can_view_gallery
  ) as access
  where private.account_access_enabled(viewer.viewer_id)
    and not private.is_blocked_between(profile.id, viewer.viewer_id)
    and (target_profile_id is null or profile.id = target_profile_id)
    and (
      profile.id = viewer.viewer_id
      or (
        profile.onboarding_completed_at is not null
        and (
          privacy.profile_visibility = 'public'
          or (privacy.profile_visibility = 'friends' and friendship.is_friend)
        )
      )
    )
  order by (profile.id = viewer.viewer_id) desc, profile.full_name nulls last, profile.id
  limit least(greatest(coalesce(page_size, 20), 1), 50)
  offset least(greatest(coalesce(page_offset, 0), 0), 10000);
$$;

revoke all on function public.get_visible_profiles(uuid, integer, integer) from public, anon;
grant execute on function public.get_visible_profiles(uuid, integer, integer) to authenticated;

-- Profile media reservations separate database metadata from Storage API object writes.
create or replace function public.reserve_profile_media(
  p_purpose public.profile_media_purpose,
  p_mime_type text,
  p_byte_size bigint,
  p_width integer,
  p_height integer
)
returns public.profile_media
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  media_id uuid := gen_random_uuid();
  extension text;
  next_order smallint := 0;
  media_count integer;
  reserved public.profile_media;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_purpose is null
    or p_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
    or p_byte_size not between 1 and 10485760
    or p_width not between 1 and 12000
    or p_height not between 1 and 12000 then
    raise exception 'Invalid profile media metadata.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(actor_id::text || ':' || p_purpose::text, 0));

  update public.profile_media
  set status = 'failed'
  where profile_id = actor_id
    and status = 'pending'
    and created_at < timezone('utc', now()) - interval '1 hour';

  if p_purpose in ('avatar', 'cover') then
    update public.profile_media
    set status = 'failed'
    where profile_id = actor_id
      and purpose = p_purpose
      and status = 'pending';
  else
    select count(*)
    into media_count
    from public.profile_media
    where profile_id = actor_id
      and purpose = 'gallery'
      and status in ('pending', 'ready');

    if media_count >= 9 then
      raise exception 'The gallery is limited to nine items.' using errcode = '23514';
    end if;

    select min(slot)::smallint into next_order
    from generate_series(0, 8) as available(slot)
    where not exists (
      select 1
      from public.profile_media
      where profile_id = actor_id
        and purpose = 'gallery'
        and status in ('pending', 'ready')
        and sort_order = available.slot
    );
  end if;

  extension := case p_mime_type
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    when 'image/avif' then 'avif'
  end;

  insert into public.profile_media (
    id,
    profile_id,
    purpose,
    object_path,
    mime_type,
    byte_size,
    width,
    height,
    sort_order
  ) values (
    media_id,
    actor_id,
    p_purpose,
    actor_id::text || '/' || media_id::text || '.' || extension,
    p_mime_type,
    p_byte_size,
    p_width,
    p_height,
    next_order
  )
  returning * into reserved;

  return reserved;
end;
$$;

create or replace function public.finalize_profile_media(p_media_id uuid)
returns public.profile_media
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  media_record public.profile_media;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into media_record
  from public.profile_media
  where id = p_media_id
    and profile_id = actor_id
    and status = 'pending'
  for update;

  if not found then
    raise exception 'Pending profile media not found.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from storage.objects
    where bucket_id = media_record.bucket_id
      and name = media_record.object_path
      and owner_id = actor_id::text
  ) then
    raise exception 'The uploaded Storage object was not found or is not owned by this profile.' using errcode = 'P0002';
  end if;

  if media_record.purpose in ('avatar', 'cover') then
    update public.profile_media
    set status = 'deleting'
    where profile_id = actor_id
      and purpose = media_record.purpose
      and status = 'ready'
      and id <> media_record.id;
  end if;

  update public.profile_media
  set status = 'ready'
  where id = media_record.id
  returning * into media_record;

  if media_record.purpose = 'avatar' then
    update public.profiles
    set avatar_path = media_record.object_path
    where id = actor_id;
  end if;

  return media_record;
end;
$$;

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
  for update;
  if not found then
    raise exception 'Profile media not found.' using errcode = 'P0002';
  end if;

  if removed.purpose = 'gallery' then
    perform pg_advisory_xact_lock(hashtextextended(actor_id::text || ':gallery', 0));
  end if;

  delete from public.profile_media
  where id = removed.id;

  if removed.purpose = 'avatar' then
    update public.profiles
    set avatar_path = null
    where id = actor_id
      and avatar_path = removed.object_path;
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

  -- The caller must remove removed.object_path through the Storage API. Storage metadata is read-only SQL state.
  return removed;
end;
$$;

create or replace function public.reorder_profile_gallery(p_media_ids uuid[])
returns setof public.profile_media
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  supplied_count integer;
  owned_count integer;
  gallery_count integer;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  supplied_count := coalesce(cardinality(p_media_ids), 0);
  if supplied_count > 9 then
    raise exception 'The gallery is limited to nine items.' using errcode = '22023';
  end if;

  if supplied_count <> (
    select count(distinct media_id)
    from unnest(coalesce(p_media_ids, '{}'::uuid[])) as media(media_id)
  ) then
    raise exception 'Gallery media identifiers must be unique.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(actor_id::text || ':gallery', 0));

  select count(*) into owned_count
  from public.profile_media
  where id = any(coalesce(p_media_ids, '{}'::uuid[]))
    and profile_id = actor_id
    and purpose = 'gallery'
    and status = 'ready';

  select count(*) into gallery_count
  from public.profile_media
  where profile_id = actor_id
    and purpose = 'gallery'
    and status = 'ready';

  if supplied_count <> owned_count or supplied_count <> gallery_count then
    raise exception 'Provide every ready gallery item exactly once.' using errcode = '22023';
  end if;

  update public.profile_media as media
  set sort_order = ordering.ordinality - 1
  from unnest(coalesce(p_media_ids, '{}'::uuid[])) with ordinality as ordering(media_id, ordinality)
  where media.id = ordering.media_id
    and media.profile_id = actor_id;

  return query
  select *
  from public.profile_media
  where profile_id = actor_id
    and purpose = 'gallery'
    and status = 'ready'
  order by sort_order;
end;
$$;

create or replace function public.list_profile_media_cleanup(p_limit integer default 100)
returns setof public.profile_media
language sql
stable
security definer
set search_path = ''
as $$
  select *
  from public.profile_media
  where status = 'deleting'
     or (status in ('pending', 'failed') and updated_at < timezone('utc', now()) - interval '1 hour')
  order by updated_at, id
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

create or replace function public.complete_profile_media_cleanup(p_media_id uuid)
returns void
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
    and (
      status in ('deleting', 'failed')
      or (status = 'pending' and updated_at < timezone('utc', now()) - interval '1 hour')
    )
  for update;

  if not found then
    raise exception 'Cleanup media not found.' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from storage.objects
    where bucket_id = media_record.bucket_id
      and name = media_record.object_path
  ) then
    raise exception 'Remove the Storage object before completing metadata cleanup.' using errcode = '55000';
  end if;

  delete from public.profile_media where id = media_record.id;
end;
$$;

revoke all on function public.reserve_profile_media(public.profile_media_purpose, text, bigint, integer, integer) from public, anon;
revoke all on function public.finalize_profile_media(uuid) from public, anon;
revoke all on function public.remove_profile_media(uuid) from public, anon;
revoke all on function public.reorder_profile_gallery(uuid[]) from public, anon;
revoke all on function public.list_profile_media_cleanup(integer) from public, anon, authenticated;
revoke all on function public.complete_profile_media_cleanup(uuid) from public, anon, authenticated;
grant execute on function public.reserve_profile_media(public.profile_media_purpose, text, bigint, integer, integer) to authenticated;
grant execute on function public.finalize_profile_media(uuid) to authenticated;
grant execute on function public.remove_profile_media(uuid) to authenticated;
grant execute on function public.reorder_profile_gallery(uuid[]) to authenticated;
grant execute on function public.list_profile_media_cleanup(integer) to service_role;
grant execute on function public.complete_profile_media_cleanup(uuid) to service_role;

-- A blocker can resolve only a block they own. An inverse block remains indistinguishable from a
-- private or missing profile, preventing this helper from becoming a block-discovery oracle.
create or replace function public.get_own_blocked_profile_by_username(p_username text)
returns table (
  block_id uuid,
  blocked_profile_id uuid,
  full_name text,
  username text,
  avatar_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    block.id,
    profile.id,
    profile.full_name,
    profile.username::text,
    profile.avatar_path
  from public.blocks as block
  join public.profiles as profile on profile.id = block.blocked_id
  where block.blocker_id = (select auth.uid())
    and private.account_access_enabled((select auth.uid()))
    and p_username is not null
    and octet_length(p_username) <= 128
    and profile.username = lower(trim(leading '@' from btrim(p_username)))::extensions.citext
  limit 1;
$$;

revoke all on function public.get_own_blocked_profile_by_username(text) from public, anon;
grant execute on function public.get_own_blocked_profile_by_username(text) to authenticated;

create or replace function public.block_profile(p_target_profile_id uuid, p_reason text default null)
returns public.blocks
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  blocked_record public.blocks;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_target_profile_id is null or p_target_profile_id = actor_id then
    raise exception 'Choose another profile.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_target_profile_id) then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;
  if p_reason is not null and char_length(p_reason) > 300 then
    raise exception 'Block reason is too long.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(least(actor_id, p_target_profile_id)::text || ':' || greatest(actor_id, p_target_profile_id)::text, 0)
  );

  insert into public.blocks (blocker_id, blocked_id, reason)
  values (actor_id, p_target_profile_id, nullif(btrim(p_reason), ''))
  on conflict (blocker_id, blocked_id)
  do update set reason = excluded.reason
  returning * into blocked_record;

  delete from public.friendships
  where (requester_id = actor_id and addressee_id = p_target_profile_id)
     or (requester_id = p_target_profile_id and addressee_id = actor_id);

  update public.conversation_requests
  set status = 'cancelled', responded_at = timezone('utc', now())
  where status = 'pending'
    and (
      (requester_id = actor_id and recipient_id = p_target_profile_id)
      or (requester_id = p_target_profile_id and recipient_id = actor_id)
    );

  return blocked_record;
end;
$$;

create or replace function public.unblock_profile(p_target_profile_id uuid)
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

  delete from public.blocks
  where blocker_id = actor_id
    and blocked_id = p_target_profile_id;
end;
$$;

-- Harden the existing no-follow friendship RPC with block and sanction checks.
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
  if not private.is_socially_active(actor_id) then
    raise exception 'An active completed profile is required.' using errcode = '42501';
  end if;
  if target_user_id is null or target_user_id = actor_id then
    raise exception 'Choose another profile.' using errcode = '22023';
  end if;
  if private.is_blocked_between(actor_id, target_user_id) then
    raise exception 'This relationship is unavailable.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = target_user_id and onboarding_completed_at is not null
  ) then
    raise exception 'Profile is unavailable.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(least(actor_id, target_user_id)::text || ':' || greatest(actor_id, target_user_id)::text, 0)
  );

  select friendship.* into relationship
  from public.friendships as friendship
  where (friendship.requester_id = actor_id and friendship.addressee_id = target_user_id)
     or (friendship.requester_id = target_user_id and friendship.addressee_id = actor_id)
  for update;

  if found then
    if relationship.status = 'declined' then
      update public.friendships
      set requester_id = actor_id,
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

create or replace function public.respond_to_friendship(friendship_id uuid, accept_request boolean)
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
  if not private.is_socially_active(actor_id) then
    raise exception 'An active completed profile is required.' using errcode = '42501';
  end if;
  if accept_request is null then
    raise exception 'A response is required.' using errcode = '22023';
  end if;

  select * into relationship
  from public.friendships
  where id = friendship_id
    and addressee_id = actor_id
    and status = 'pending'
  for update;

  if not found then
    raise exception 'Pending friendship request not found.' using errcode = 'P0002';
  end if;
  if accept_request and private.is_blocked_between(relationship.requester_id, relationship.addressee_id) then
    raise exception 'This relationship is unavailable.' using errcode = '42501';
  end if;

  update public.friendships
  set status = (case when accept_request then 'accepted' else 'declined' end)::public.friendship_status,
      accepted_at = case when accept_request then timezone('utc', now()) else null end
  where id = relationship.id
  returning * into relationship;

  return relationship;
end;
$$;

create or replace function public.create_community(
  p_name text,
  p_slug text,
  p_description text default '',
  p_visibility public.community_visibility default 'public',
  p_category text default 'general'
)
returns public.communities
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  community_record public.communities;
  normalized_slug text := lower(btrim(p_slug));
  normalized_category text := lower(btrim(p_category));
begin
  if not private.is_socially_active(actor_id) then
    raise exception 'An active completed profile is required.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 3 and 100
    or normalized_slug !~ '^[a-z0-9][a-z0-9-]{2,47}$'
    or normalized_category !~ '^[a-z][a-z0-9_]{1,39}$'
    or char_length(coalesce(p_description, '')) > 2000
    or p_visibility is null then
    raise exception 'Invalid community data.' using errcode = '22023';
  end if;

  insert into public.communities (slug, name, description, category, owner_id, visibility)
  values (
    normalized_slug,
    btrim(p_name),
    btrim(coalesce(p_description, '')),
    normalized_category,
    actor_id,
    p_visibility
  )
  returning * into community_record;

  insert into public.community_memberships (community_id, profile_id, role, status, joined_at)
  values (community_record.id, actor_id, 'owner', 'active', timezone('utc', now()));

  return community_record;
end;
$$;

-- Private communities remain undiscoverable through raw tables. This narrow projection exposes
-- only the metadata required to understand and request entry from a deep link.
create or replace function public.get_community_discovery(p_community_id uuid)
returns table (
  community_id uuid,
  slug text,
  name text,
  description text,
  category text,
  avatar_path text,
  cover_path text,
  visibility public.community_visibility,
  active_member_count bigint,
  active_post_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    community.id,
    community.slug::text,
    community.name,
    community.description,
    community.category,
    community.avatar_path,
    community.cover_path,
    community.visibility,
    (
      select count(*)
      from public.community_memberships as membership
      where membership.community_id = community.id
        and membership.status = 'active'
    ),
    (
      select count(*)
      from public.community_posts as post
      where post.community_id = community.id
        and post.status = 'active'
    )
  from public.communities as community
  cross join (select auth.uid() as viewer_id) as viewer
  where community.id = p_community_id
    and community.archived_at is null
    and private.is_socially_active(viewer.viewer_id)
    and (community.owner_id is null or not private.is_blocked_between(community.owner_id, viewer.viewer_id));
$$;

create or replace function public.join_community(p_community_id uuid)
returns public.community_memberships
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  community_record public.communities;
  membership public.community_memberships;
  next_status public.community_membership_status;
begin
  if not private.is_socially_active(actor_id) then
    raise exception 'An active completed profile is required.' using errcode = '42501';
  end if;

  select * into community_record
  from public.communities
  where id = p_community_id and archived_at is null;
  if not found then
    raise exception 'Community not found.' using errcode = 'P0002';
  end if;

  next_status := (case when community_record.visibility = 'public' then 'active' else 'pending' end)::public.community_membership_status;

  insert into public.community_memberships (community_id, profile_id, role, status, joined_at)
  values (
    p_community_id,
    actor_id,
    'member',
    next_status,
    case when next_status = 'active' then timezone('utc', now()) else null end
  )
  on conflict (community_id, profile_id) do update
    set status = (case
          when community_memberships.status = 'banned' then 'banned'::public.community_membership_status
          else excluded.status
        end)::public.community_membership_status,
        joined_at = case
          when community_memberships.status = 'banned' then community_memberships.joined_at
          else excluded.joined_at
        end
  returning * into membership;

  if membership.status = 'banned' then
    raise exception 'Community membership is unavailable.' using errcode = '42501';
  end if;

  return membership;
end;
$$;

create or replace function public.leave_community(p_community_id uuid)
returns public.community_memberships
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  membership public.community_memberships;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.community_memberships
    where community_id = p_community_id and profile_id = actor_id and role = 'owner'
  ) then
    raise exception 'Transfer or archive the community before the owner leaves.' using errcode = '23514';
  end if;

  update public.community_memberships
  set status = 'left', joined_at = null
  where community_id = p_community_id
    and profile_id = actor_id
    and status in ('pending', 'active')
  returning * into membership;

  if not found then
    raise exception 'Active community membership not found.' using errcode = 'P0002';
  end if;
  return membership;
end;
$$;

create or replace function public.respond_to_community_membership(
  p_community_id uuid,
  p_profile_id uuid,
  p_accept boolean
)
returns public.community_memberships
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  membership public.community_memberships;
begin
  if not private.can_manage_community(p_community_id, actor_id) then
    raise exception 'Community management permission required.' using errcode = '42501';
  end if;
  if p_accept is null then
    raise exception 'A response is required.' using errcode = '22023';
  end if;

  update public.community_memberships
  set status = (case when p_accept then 'active' else 'left' end)::public.community_membership_status,
      joined_at = case when p_accept then timezone('utc', now()) else null end
  where community_id = p_community_id
    and profile_id = p_profile_id
    and role = 'member'
    and status = 'pending'
  returning * into membership;

  if not found then
    raise exception 'Pending membership not found.' using errcode = 'P0002';
  end if;
  return membership;
end;
$$;

create or replace function public.update_community_details(
  p_community_id uuid,
  p_name text,
  p_description text,
  p_category text,
  p_visibility public.community_visibility,
  p_avatar_path text default null,
  p_cover_path text default null
)
returns public.communities
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  community_record public.communities;
  normalized_category text := lower(btrim(coalesce(p_category, '')));
begin
  if not private.is_socially_active(actor_id)
    or not private.can_manage_community(p_community_id, actor_id) then
    raise exception 'Community management permission required.' using errcode = '42501';
  end if;

  select * into community_record
  from public.communities
  where id = p_community_id
    and archived_at is null
  for update;

  if not found then
    raise exception 'Community not found.' using errcode = 'P0002';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 3 and 100
    or char_length(coalesce(p_description, '')) > 2000
    or normalized_category !~ '^[a-z][a-z0-9_]{1,39}$'
    or p_visibility is null then
    raise exception 'Invalid community data.' using errcode = '22023';
  end if;

  if p_avatar_path is distinct from community_record.avatar_path
    and p_avatar_path is not null
    and (
      char_length(p_avatar_path) > 300
      or split_part(p_avatar_path, '/', 1) <> actor_id::text
      or p_avatar_path !~ (
        '^' || actor_id::text || '/community/' || p_community_id::text ||
        '/avatar/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp|avif)$'
      )
      or lower(coalesce(storage.extension(p_avatar_path), '')) not in ('jpg', 'jpeg', 'png', 'webp', 'avif')
      or not exists (
        select 1
        from storage.objects
        where bucket_id = 'community-media'
          and name = p_avatar_path
          and owner_id = actor_id::text
      )
    ) then
    raise exception 'The community avatar must be an owned image in community-media.' using errcode = '22023';
  end if;

  if p_cover_path is distinct from community_record.cover_path
    and p_cover_path is not null
    and (
      char_length(p_cover_path) > 300
      or split_part(p_cover_path, '/', 1) <> actor_id::text
      or p_cover_path !~ (
        '^' || actor_id::text || '/community/' || p_community_id::text ||
        '/cover/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp|avif)$'
      )
      or lower(coalesce(storage.extension(p_cover_path), '')) not in ('jpg', 'jpeg', 'png', 'webp', 'avif')
      or not exists (
        select 1
        from storage.objects
        where bucket_id = 'community-media'
          and name = p_cover_path
          and owner_id = actor_id::text
      )
    ) then
    raise exception 'The community cover must be an owned image in community-media.' using errcode = '22023';
  end if;

  update public.communities
  set name = btrim(p_name),
      description = btrim(coalesce(p_description, '')),
      category = normalized_category,
      visibility = p_visibility,
      avatar_path = p_avatar_path,
      cover_path = p_cover_path
  where id = community_record.id
  returning * into community_record;

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (
    actor_id,
    'community.details_updated',
    'community',
    community_record.id,
    jsonb_build_object('visibility', community_record.visibility::text, 'category', community_record.category)
  );

  return community_record;
end;
$$;

create or replace function public.archive_community(p_community_id uuid)
returns public.communities
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  community_record public.communities;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select community.* into community_record
  from public.communities as community
  where community.id = p_community_id
    and community.owner_id = actor_id
    and community.archived_at is null
    and exists (
      select 1
      from public.community_memberships as membership
      where membership.community_id = community.id
        and membership.profile_id = actor_id
        and membership.role = 'owner'
        and membership.status = 'active'
    )
  for update;

  if not found then
    raise exception 'Active owned community not found.' using errcode = 'P0002';
  end if;

  update public.communities
  set archived_at = timezone('utc', now())
  where id = community_record.id
  returning * into community_record;

  update public.community_posts
  set status = 'removed'
  where community_id = community_record.id
    and status <> 'removed';

  update public.post_media as media
  set status = 'deleting'
  from public.community_posts as post
  where post.id = media.post_id
    and post.community_id = community_record.id
    and media.status in ('pending', 'ready', 'failed');

  update public.community_memberships
  set status = 'left',
      joined_at = null
  where community_id = community_record.id
    and status <> 'left';

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (
    actor_id,
    'community.archived',
    'community',
    community_record.id,
    jsonb_build_object('slug', community_record.slug::text)
  );

  return community_record;
end;
$$;

create or replace function public.upsert_community_rule(
  p_community_id uuid,
  p_title text,
  p_description text,
  p_sort_order smallint,
  p_rule_id uuid default null
)
returns public.community_rules
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  rule_record public.community_rules;
  occupied_rule_id uuid;
  old_sort_order smallint;
  free_sort_order smallint;
begin
  if not private.is_socially_active(actor_id)
    or not private.can_manage_community(p_community_id, actor_id) then
    raise exception 'Community management permission required.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 2 and 100
    or char_length(btrim(coalesce(p_description, ''))) not between 2 and 1000
    or p_sort_order is null
    or p_sort_order not between 0 and 49 then
    raise exception 'Invalid community rule.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_community_id::text || ':rules', 0));
  set constraints public.community_rules_order_unique deferred;

  if p_rule_id is null then
    if (select count(*) from public.community_rules where community_id = p_community_id) >= 50 then
      raise exception 'A community can contain at most fifty rules.' using errcode = '23514';
    end if;

    select min(slot)::smallint into free_sort_order
    from generate_series(p_sort_order::integer, 49) as available(slot)
    where not exists (
      select 1
      from public.community_rules
      where community_id = p_community_id
        and sort_order = available.slot
    );

    if free_sort_order is not null then
      update public.community_rules
      set sort_order = sort_order + 1
      where community_id = p_community_id
        and sort_order >= p_sort_order
        and sort_order < free_sort_order;
    else
      select max(slot)::smallint into free_sort_order
      from generate_series(0, p_sort_order::integer) as available(slot)
      where not exists (
        select 1
        from public.community_rules
        where community_id = p_community_id
          and sort_order = available.slot
      );

      if free_sort_order is null then
        raise exception 'No community rule position is available.' using errcode = '23514';
      end if;

      update public.community_rules
      set sort_order = sort_order - 1
      where community_id = p_community_id
        and sort_order > free_sort_order
        and sort_order <= p_sort_order;
    end if;

    insert into public.community_rules (
      community_id,
      title,
      description,
      sort_order,
      created_by
    ) values (
      p_community_id,
      btrim(p_title),
      btrim(p_description),
      p_sort_order,
      actor_id
    )
    returning * into rule_record;
  else
    select * into rule_record
    from public.community_rules
    where id = p_rule_id
      and community_id = p_community_id
    for update;

    if not found then
      raise exception 'Community rule not found.' using errcode = 'P0002';
    end if;

    old_sort_order := rule_record.sort_order;
    if p_sort_order <> old_sort_order then
      select id into occupied_rule_id
      from public.community_rules
      where community_id = p_community_id
        and sort_order = p_sort_order
        and id <> p_rule_id
      for update;

      if occupied_rule_id is not null then
        update public.community_rules
        set sort_order = old_sort_order
        where id = occupied_rule_id;
      end if;
    end if;

    update public.community_rules
    set title = btrim(p_title),
        description = btrim(p_description),
        sort_order = p_sort_order
    where id = p_rule_id
    returning * into rule_record;
  end if;

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (
    actor_id,
    'community.rule_upserted',
    'community_rule',
    rule_record.id,
    jsonb_build_object('community_id', p_community_id, 'sort_order', rule_record.sort_order)
  );

  return rule_record;
end;
$$;

create or replace function public.delete_community_rule(p_rule_id uuid)
returns public.community_rules
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  rule_record public.community_rules;
begin
  select * into rule_record
  from public.community_rules
  where id = p_rule_id
  for update;

  if not found then
    raise exception 'Community rule not found.' using errcode = 'P0002';
  end if;
  if not private.is_socially_active(actor_id)
    or not private.can_manage_community(rule_record.community_id, actor_id) then
    raise exception 'Community management permission required.' using errcode = '42501';
  end if;

  delete from public.community_rules where id = rule_record.id;

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (
    actor_id,
    'community.rule_deleted',
    'community_rule',
    rule_record.id,
    jsonb_build_object('community_id', rule_record.community_id, 'sort_order', rule_record.sort_order)
  );

  return rule_record;
end;
$$;

create or replace function public.set_community_member_role(
  p_community_id uuid,
  p_profile_id uuid,
  p_role public.community_role
)
returns public.community_memberships
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  membership public.community_memberships;
  actor_is_owner boolean;
begin
  if not private.is_socially_active(actor_id)
    or p_role is null
    or p_role not in ('moderator', 'member')
    or p_profile_id is null
    or p_profile_id = actor_id then
    raise exception 'Invalid community role change.' using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.communities as community
    join public.community_memberships as owner_membership
      on owner_membership.community_id = community.id
     and owner_membership.profile_id = actor_id
    where community.id = p_community_id
      and community.owner_id = actor_id
      and community.archived_at is null
      and owner_membership.role = 'owner'
      and owner_membership.status = 'active'
  ) into actor_is_owner;

  if not actor_is_owner then
    raise exception 'Only the active community owner can change member roles.' using errcode = '42501';
  end if;

  update public.community_memberships
  set role = p_role
  where community_id = p_community_id
    and profile_id = p_profile_id
    and role <> 'owner'
    and status = 'active'
  returning * into membership;

  if not found then
    raise exception 'Active non-owner membership not found.' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (
    actor_id,
    'community.member_role_changed',
    'community',
    p_community_id,
    jsonb_build_object('profile_id', p_profile_id, 'role', p_role::text)
  );

  return membership;
end;
$$;

create or replace function public.ban_community_member(
  p_community_id uuid,
  p_profile_id uuid,
  p_reason text default null
)
returns public.community_memberships
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_membership public.community_memberships;
  membership public.community_memberships;
  actor_is_global_moderator boolean := private.is_moderator(actor_id);
begin
  if p_profile_id is null
    or p_profile_id = actor_id
    or char_length(coalesce(p_reason, '')) > 1000
    or not private.is_socially_active(actor_id)
    or not private.can_manage_community(p_community_id, actor_id) then
    raise exception 'Community management permission required.' using errcode = '42501';
  end if;

  select * into actor_membership
  from public.community_memberships
  where community_id = p_community_id
    and profile_id = actor_id
    and status = 'active';

  select * into membership
  from public.community_memberships
  where community_id = p_community_id
    and profile_id = p_profile_id
    and status in ('pending', 'active', 'left')
  for update;

  if not found then
    raise exception 'Community membership not found.' using errcode = 'P0002';
  end if;
  if membership.role = 'owner'
    or (
      not actor_is_global_moderator
      and actor_membership.role = 'moderator'
      and membership.role <> 'member'
    ) then
    raise exception 'This membership cannot be banned by the current actor.' using errcode = '42501';
  end if;

  update public.community_memberships
  set role = 'member',
      status = 'banned',
      joined_at = null
  where community_id = p_community_id
    and profile_id = p_profile_id
  returning * into membership;

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (
    actor_id,
    'community.member_banned',
    'community',
    p_community_id,
    jsonb_strip_nulls(jsonb_build_object('profile_id', p_profile_id, 'reason', nullif(btrim(coalesce(p_reason, '')), '')))
  );

  return membership;
end;
$$;

create or replace function public.unban_community_member(
  p_community_id uuid,
  p_profile_id uuid
)
returns public.community_memberships
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  membership public.community_memberships;
begin
  if p_profile_id is null
    or not private.is_socially_active(actor_id)
    or not private.can_manage_community(p_community_id, actor_id) then
    raise exception 'Community management permission required.' using errcode = '42501';
  end if;

  update public.community_memberships
  set role = 'member',
      status = 'left',
      joined_at = null
  where community_id = p_community_id
    and profile_id = p_profile_id
    and status = 'banned'
  returning * into membership;

  if not found then
    raise exception 'Banned community membership not found.' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (
    actor_id,
    'community.member_unbanned',
    'community',
    p_community_id,
    jsonb_build_object('profile_id', p_profile_id)
  );

  return membership;
end;
$$;

create or replace function public.remove_community_post(p_post_id uuid)
returns public.community_posts
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  post_record public.community_posts;
  privileged_removal boolean;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into post_record
  from public.community_posts
  where id = p_post_id
  for update;

  if not found then
    raise exception 'Community post not found.' using errcode = 'P0002';
  end if;

  privileged_removal := post_record.author_id is distinct from actor_id;
  if privileged_removal and (
    not private.is_socially_active(actor_id)
    or (
      not private.is_moderator(actor_id)
      and (
        post_record.community_id is null
        or not private.can_manage_community(post_record.community_id, actor_id)
      )
    )
  ) then
    raise exception 'Post removal permission required.' using errcode = '42501';
  end if;

  if post_record.status <> 'removed' then
    update public.community_posts
    set status = 'removed'
    where id = post_record.id
    returning * into post_record;

    update public.post_media
    set status = 'deleting'
    where post_id = post_record.id
      and status in ('pending', 'ready', 'failed');

    insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
    values (
      actor_id,
      'content.community_post_removed',
      'community_post',
      post_record.id,
      jsonb_build_object(
        'community_id', post_record.community_id,
        'author_id', post_record.author_id,
        'privileged', privileged_removal
      )
    );
  end if;

  return post_record;
end;
$$;

create or replace function public.remove_post_comment(p_comment_id uuid)
returns public.post_comments
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  comment_record public.post_comments;
  post_community_id uuid;
  privileged_removal boolean;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select comment.* into comment_record
  from public.post_comments as comment
  where comment.id = p_comment_id
  for update;

  if not found then
    raise exception 'Post comment not found.' using errcode = 'P0002';
  end if;

  select community_id into post_community_id
  from public.community_posts
  where id = comment_record.post_id;

  privileged_removal := comment_record.author_id is distinct from actor_id;
  if privileged_removal and (
    not private.is_socially_active(actor_id)
    or (
      not private.is_moderator(actor_id)
      and (
        post_community_id is null
        or not private.can_manage_community(post_community_id, actor_id)
      )
    )
  ) then
    raise exception 'Comment removal permission required.' using errcode = '42501';
  end if;

  if comment_record.status <> 'removed' then
    update public.post_comments
    set status = 'removed'
    where id = comment_record.id
    returning * into comment_record;

    insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
    values (
      actor_id,
      'content.post_comment_removed',
      'post_comment',
      comment_record.id,
      jsonb_build_object(
        'post_id', comment_record.post_id,
        'author_id', comment_record.author_id,
        'privileged', privileged_removal
      )
    );
  end if;

  return comment_record;
end;
$$;

create or replace function public.reserve_post_media(
  p_post_id uuid,
  p_object_path text,
  p_mime_type text,
  p_byte_size bigint,
  p_width integer,
  p_height integer,
  p_sort_order smallint
)
returns public.post_media
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  reserved public.post_media;
  path_extension text := lower(coalesce(storage.extension(p_object_path), ''));
begin
  if not private.is_socially_active(actor_id) then
    raise exception 'An active completed profile is required.' using errcode = '42501';
  end if;
  if p_object_path is null
    or char_length(p_object_path) not between 38 and 300
    or split_part(p_object_path, '/', 1) <> actor_id::text
    or p_object_path !~ (
      '^' || actor_id::text || '/post/' || p_post_id::text ||
      '/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp|avif|mp4)$'
    )
    or p_mime_type is null
    or p_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4')
    or p_byte_size is null
    or p_byte_size not between 1 and 26214400
    or p_sort_order is null
    or p_sort_order not between 0 and 5
    or (
      (p_mime_type = 'image/jpeg' and path_extension not in ('jpg', 'jpeg'))
      or (p_mime_type = 'image/png' and path_extension <> 'png')
      or (p_mime_type = 'image/webp' and path_extension <> 'webp')
      or (p_mime_type = 'image/avif' and path_extension <> 'avif')
      or (p_mime_type = 'video/mp4' and path_extension <> 'mp4')
    )
    or (
      p_mime_type <> 'video/mp4'
      and (
        p_width is null
        or p_height is null
        or p_width not between 1 and 12000
        or p_height not between 1 and 12000
      )
    )
    or (
      p_mime_type = 'video/mp4'
      and (
        (p_width is null) <> (p_height is null)
        or (
          p_width is not null
          and (
            p_width not between 1 and 12000
            or p_height not between 1 and 12000
          )
        )
      )
    ) then
    raise exception 'Invalid post media reservation.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_post_id::text || ':media', 0));

  update public.post_media
  set status = 'failed'
  where owner_id = actor_id
    and status = 'pending'
    and updated_at < timezone('utc', now()) - interval '1 hour';

  if not exists (
    select 1
    from public.community_posts
    where id = p_post_id
      and author_id = actor_id
      and status = 'active'
  ) then
    raise exception 'Active owned post not found.' using errcode = 'P0002';
  end if;
  if (
    select count(*)
    from public.post_media
    where post_id = p_post_id
      and status in ('pending', 'ready')
  ) >= 6 then
    raise exception 'A post can contain at most six media objects.' using errcode = '23514';
  end if;
  if exists (
    select 1
    from public.post_media
    where post_id = p_post_id
      and sort_order = p_sort_order
      and status in ('pending', 'ready')
  ) then
    raise exception 'The requested post media position is already occupied.' using errcode = '23505';
  end if;

  insert into public.post_media (
    post_id,
    owner_id,
    object_path,
    mime_type,
    byte_size,
    width,
    height,
    sort_order
  ) values (
    p_post_id,
    actor_id,
    p_object_path,
    p_mime_type,
    p_byte_size,
    p_width,
    p_height,
    p_sort_order
  )
  returning * into reserved;

  return reserved;
end;
$$;

create or replace function public.finalize_post_media(p_media_id uuid)
returns public.post_media
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  media_record public.post_media;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into media_record
  from public.post_media
  where id = p_media_id
    and owner_id = actor_id
    and status = 'pending'
  for update;

  if not found then
    raise exception 'Pending post media not found.' using errcode = 'P0002';
  end if;
  if not exists (
    select 1
    from public.community_posts
    where id = media_record.post_id
      and author_id = actor_id
      and status = 'active'
  ) then
    raise exception 'The post is no longer available.' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from storage.objects
    where bucket_id = media_record.bucket_id
      and name = media_record.object_path
      and owner_id = actor_id::text
  ) then
    raise exception 'The uploaded Storage object was not found or is not owned by this profile.' using errcode = 'P0002';
  end if;

  update public.post_media
  set status = 'ready'
  where id = media_record.id
  returning * into media_record;

  return media_record;
end;
$$;

create or replace function public.remove_post_media(p_media_id uuid)
returns public.post_media
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  media_record public.post_media;
  post_record public.community_posts;
  privileged_removal boolean;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into media_record
  from public.post_media
  where id = p_media_id
  for update;

  if not found then
    raise exception 'Post media not found.' using errcode = 'P0002';
  end if;

  select * into post_record
  from public.community_posts
  where id = media_record.post_id;

  privileged_removal := media_record.owner_id <> actor_id;
  if privileged_removal and (
    not private.is_socially_active(actor_id)
    or (
      not private.is_moderator(actor_id)
      and (
        post_record.community_id is null
        or not private.can_manage_community(post_record.community_id, actor_id)
      )
    )
  ) then
    raise exception 'Post media removal permission required.' using errcode = '42501';
  end if;

  update public.post_media
  set status = 'deleting'
  where id = media_record.id
  returning * into media_record;

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (
    actor_id,
    'content.post_media_removed',
    'post_media',
    media_record.id,
    jsonb_build_object('post_id', media_record.post_id, 'privileged', privileged_removal)
  );

  return media_record;
end;
$$;

create or replace function public.list_post_media_cleanup(p_limit integer default 100)
returns setof public.post_media
language sql
stable
security definer
set search_path = ''
as $$
  select *
  from public.post_media
  where status = 'deleting'
     or (status in ('pending', 'failed') and updated_at < timezone('utc', now()) - interval '1 hour')
  order by updated_at, id
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
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
  if exists (
    select 1
    from storage.objects
    where bucket_id = media_record.bucket_id
      and name = media_record.object_path
  ) then
    raise exception 'Remove the Storage object before completing post media cleanup.' using errcode = '55000';
  end if;

  delete from public.post_media where id = media_record.id;
end;
$$;

revoke all on function public.block_profile(uuid, text) from public, anon;
revoke all on function public.unblock_profile(uuid) from public, anon;
revoke all on function public.create_community(text, text, text, public.community_visibility, text) from public, anon;
revoke all on function public.get_community_discovery(uuid) from public, anon;
revoke all on function public.join_community(uuid) from public, anon;
revoke all on function public.leave_community(uuid) from public, anon;
revoke all on function public.respond_to_community_membership(uuid, uuid, boolean) from public, anon;
revoke all on function public.update_community_details(uuid, text, text, text, public.community_visibility, text, text) from public, anon;
revoke all on function public.archive_community(uuid) from public, anon;
revoke all on function public.upsert_community_rule(uuid, text, text, smallint, uuid) from public, anon;
revoke all on function public.delete_community_rule(uuid) from public, anon;
revoke all on function public.set_community_member_role(uuid, uuid, public.community_role) from public, anon;
revoke all on function public.ban_community_member(uuid, uuid, text) from public, anon;
revoke all on function public.unban_community_member(uuid, uuid) from public, anon;
revoke all on function public.remove_community_post(uuid) from public, anon;
revoke all on function public.remove_post_comment(uuid) from public, anon;
revoke all on function public.reserve_post_media(uuid, text, text, bigint, integer, integer, smallint) from public, anon;
revoke all on function public.finalize_post_media(uuid) from public, anon;
revoke all on function public.remove_post_media(uuid) from public, anon;
revoke all on function public.list_post_media_cleanup(integer) from public, anon, authenticated;
revoke all on function public.complete_post_media_cleanup(uuid) from public, anon, authenticated;
grant execute on function public.block_profile(uuid, text) to authenticated;
grant execute on function public.unblock_profile(uuid) to authenticated;
grant execute on function public.create_community(text, text, text, public.community_visibility, text) to authenticated;
grant execute on function public.get_community_discovery(uuid) to authenticated;
grant execute on function public.join_community(uuid) to authenticated;
grant execute on function public.leave_community(uuid) to authenticated;
grant execute on function public.respond_to_community_membership(uuid, uuid, boolean) to authenticated;
grant execute on function public.update_community_details(uuid, text, text, text, public.community_visibility, text, text) to authenticated;
grant execute on function public.archive_community(uuid) to authenticated;
grant execute on function public.upsert_community_rule(uuid, text, text, smallint, uuid) to authenticated;
grant execute on function public.delete_community_rule(uuid) to authenticated;
grant execute on function public.set_community_member_role(uuid, uuid, public.community_role) to authenticated;
grant execute on function public.ban_community_member(uuid, uuid, text) to authenticated;
grant execute on function public.unban_community_member(uuid, uuid) to authenticated;
grant execute on function public.remove_community_post(uuid) to authenticated;
grant execute on function public.remove_post_comment(uuid) to authenticated;
grant execute on function public.reserve_post_media(uuid, text, text, bigint, integer, integer, smallint) to authenticated;
grant execute on function public.finalize_post_media(uuid) to authenticated;
grant execute on function public.remove_post_media(uuid) to authenticated;
grant execute on function public.list_post_media_cleanup(integer) to service_role;
grant execute on function public.complete_post_media_cleanup(uuid) to service_role;

create or replace function private.enqueue_notification(
  p_recipient_id uuid,
  p_actor_id uuid,
  p_type text,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_dedupe_key text default null,
  p_channel text default 'social'
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  notification_id uuid;
  enabled boolean;
begin
  if p_recipient_id is null or p_recipient_id = p_actor_id then
    return null;
  end if;
  if p_channel not in ('social', 'messages', 'community', 'system') then
    raise exception 'Invalid notification channel.' using errcode = '22023';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 8192 then
    raise exception 'Invalid notification payload.' using errcode = '22023';
  end if;

  select case p_channel
    when 'social' then social_enabled
    when 'messages' then messages_enabled
    when 'community' then community_enabled
    when 'system' then system_enabled
  end into enabled
  from public.notification_preferences
  where profile_id = p_recipient_id;

  if not coalesce(enabled, true) then
    return null;
  end if;

  insert into public.notifications (
    recipient_id, actor_id, type, entity_type, entity_id, payload, dedupe_key
  ) values (
    p_recipient_id,
    p_actor_id,
    p_type,
    p_entity_type,
    p_entity_id,
    p_payload,
    p_dedupe_key
  )
  on conflict do nothing
  returning id into notification_id;

  return notification_id;
end;
$$;

create or replace function private.ensure_direct_conversation(
  p_first uuid,
  p_second uuid,
  p_created_by uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  low_id uuid := least(p_first, p_second);
  high_id uuid := greatest(p_first, p_second);
  conversation_id uuid;
begin
  insert into public.conversations (kind, created_by, direct_user_low, direct_user_high)
  values ('direct', p_created_by, low_id, high_id)
  on conflict (direct_user_low, direct_user_high) where kind = 'direct'
  do update set updated_at = timezone('utc', now())
  returning id into conversation_id;

  insert into public.conversation_members (conversation_id, profile_id, role, status, joined_at)
  values
    (conversation_id, low_id, 'member', 'active', timezone('utc', now())),
    (conversation_id, high_id, 'member', 'active', timezone('utc', now()))
  on conflict (conversation_id, profile_id) do update
    set status = 'active', joined_at = coalesce(conversation_members.joined_at, timezone('utc', now()));

  insert into public.conversation_preferences (conversation_id, profile_id)
  values (conversation_id, low_id), (conversation_id, high_id)
  on conflict (conversation_id, profile_id) do nothing;

  return conversation_id;
end;
$$;

create or replace function public.request_conversation(
  p_target_profile_id uuid,
  p_opening_message text default null
)
returns public.conversation_requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  request_record public.conversation_requests;
  direct_conversation_id uuid;
begin
  if not private.is_socially_active(actor_id) then
    raise exception 'An active completed profile is required.' using errcode = '42501';
  end if;
  if p_target_profile_id is null or p_target_profile_id = actor_id then
    raise exception 'Choose another profile.' using errcode = '22023';
  end if;
  if p_opening_message is not null and char_length(p_opening_message) > 1000 then
    raise exception 'Opening message is too long.' using errcode = '22023';
  end if;
  if private.is_blocked_between(actor_id, p_target_profile_id) then
    raise exception 'This conversation is unavailable.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = p_target_profile_id and onboarding_completed_at is not null
  ) then
    raise exception 'Profile is unavailable.' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(least(actor_id, p_target_profile_id)::text || ':' || greatest(actor_id, p_target_profile_id)::text, 0)
  );

  select id into direct_conversation_id
  from public.conversations
  where kind = 'direct'
    and direct_user_low = least(actor_id, p_target_profile_id)
    and direct_user_high = greatest(actor_id, p_target_profile_id);

  if direct_conversation_id is not null or private.are_friends(actor_id, p_target_profile_id) then
    direct_conversation_id := private.ensure_direct_conversation(actor_id, p_target_profile_id, actor_id);

    update public.conversation_requests
    set status = 'accepted',
        conversation_id = direct_conversation_id,
        responded_at = timezone('utc', now())
    where id = (
      select id
      from public.conversation_requests
      where status = 'pending'
        and (
          (requester_id = actor_id and recipient_id = p_target_profile_id)
          or (requester_id = p_target_profile_id and recipient_id = actor_id)
        )
      order by created_at desc
      limit 1
      for update
    )
    returning * into request_record;

    if not found then
      insert into public.conversation_requests (
        requester_id, recipient_id, opening_message, status, conversation_id, responded_at
      ) values (
        actor_id,
        p_target_profile_id,
        nullif(btrim(p_opening_message), ''),
        'accepted',
        direct_conversation_id,
        timezone('utc', now())
      ) returning * into request_record;
    end if;

    return request_record;
  end if;

  select * into request_record
  from public.conversation_requests
  where status = 'pending'
    and (
      (requester_id = actor_id and recipient_id = p_target_profile_id)
      or (requester_id = p_target_profile_id and recipient_id = actor_id)
    )
  for update;

  if not found then
    insert into public.conversation_requests (requester_id, recipient_id, opening_message)
    values (actor_id, p_target_profile_id, nullif(btrim(p_opening_message), ''))
    returning * into request_record;

    perform private.enqueue_notification(
      p_target_profile_id,
      actor_id,
      'conversation_request',
      'conversation_request',
      request_record.id,
      '{}'::jsonb,
      'conversation_request:' || request_record.id::text,
      'messages'
    );
  end if;

  return request_record;
end;
$$;

create or replace function public.respond_to_conversation_request(p_request_id uuid, p_accept boolean)
returns public.conversation_requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  request_record public.conversation_requests;
  direct_conversation_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_accept is null then
    raise exception 'A response is required.' using errcode = '22023';
  end if;

  select * into request_record
  from public.conversation_requests
  where id = p_request_id
    and recipient_id = actor_id
    and status = 'pending'
  for update;

  if not found then
    raise exception 'Pending conversation request not found.' using errcode = 'P0002';
  end if;
  if private.is_blocked_between(request_record.requester_id, request_record.recipient_id) then
    raise exception 'This conversation is unavailable.' using errcode = '42501';
  end if;

  if p_accept then
    direct_conversation_id := private.ensure_direct_conversation(
      request_record.requester_id,
      request_record.recipient_id,
      request_record.requester_id
    );
  end if;

  update public.conversation_requests
  set status = (case when p_accept then 'accepted' else 'declined' end)::public.conversation_request_status,
      conversation_id = direct_conversation_id,
      responded_at = timezone('utc', now())
  where id = request_record.id
  returning * into request_record;

  perform private.enqueue_notification(
    request_record.requester_id,
    actor_id,
    case when p_accept then 'conversation_request_accepted' else 'conversation_request_declined' end,
    'conversation_request',
    request_record.id,
    case when direct_conversation_id is null then '{}'::jsonb
         else jsonb_build_object('conversation_id', direct_conversation_id)
    end,
    'conversation_request_response:' || request_record.id::text,
    'messages'
  );

  return request_record;
end;
$$;

create or replace function public.create_group_conversation(p_title text, p_member_ids uuid[])
returns public.conversations
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  conversation_record public.conversations;
  supplied_count integer := coalesce(cardinality(p_member_ids), 0);
  valid_count integer;
begin
  if not private.is_socially_active(actor_id) then
    raise exception 'An active completed profile is required.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 100
    or supplied_count not between 1 and 49 then
    raise exception 'A group requires a title and one to forty-nine invitees.' using errcode = '22023';
  end if;
  if supplied_count <> (
    select count(distinct member_id)
    from unnest(p_member_ids) as member(member_id)
  ) or actor_id = any(p_member_ids) then
    raise exception 'Group invitees must be unique and exclude the creator.' using errcode = '22023';
  end if;

  select count(*) into valid_count
  from public.profiles
  where id = any(p_member_ids)
    and onboarding_completed_at is not null
    and not private.is_blocked_between(actor_id, id);
  if valid_count <> supplied_count then
    raise exception 'One or more group invitees are unavailable.' using errcode = '42501';
  end if;

  insert into public.conversations (kind, title, created_by)
  values ('group', btrim(p_title), actor_id)
  returning * into conversation_record;

  insert into public.conversation_members (conversation_id, profile_id, role, status, joined_at)
  values (conversation_record.id, actor_id, 'owner', 'active', timezone('utc', now()));

  insert into public.conversation_members (conversation_id, profile_id, role, status)
  select conversation_record.id, member_id, 'member', 'invited'
  from unnest(p_member_ids) as member(member_id);

  insert into public.conversation_preferences (conversation_id, profile_id)
  select conversation_record.id, member.profile_id
  from public.conversation_members as member
  where member.conversation_id = conversation_record.id;

  perform private.enqueue_notification(
    member.profile_id,
    actor_id,
    'group_invitation',
    'conversation',
    conversation_record.id,
    '{}'::jsonb,
    'group_invitation:' || conversation_record.id::text || ':' || member.profile_id::text,
    'messages'
  )
  from public.conversation_members as member
  where member.conversation_id = conversation_record.id
    and member.status = 'invited';

  return conversation_record;
end;
$$;

create or replace function public.respond_to_group_invitation(p_conversation_id uuid, p_accept boolean)
returns public.conversation_members
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  member_record public.conversation_members;
begin
  if actor_id is null or p_accept is null then
    raise exception 'Authentication and a response are required.' using errcode = '42501';
  end if;

  update public.conversation_members
  set status = (case when p_accept then 'active' else 'left' end)::public.conversation_member_status,
      joined_at = case when p_accept then timezone('utc', now()) else null end
  where conversation_id = p_conversation_id
    and profile_id = actor_id
    and status = 'invited'
  returning * into member_record;

  if not found then
    raise exception 'Pending group invitation not found.' using errcode = 'P0002';
  end if;
  return member_record;
end;
$$;

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
declare
  actor_id uuid := auth.uid();
  message_record public.messages;
begin
  if not private.can_send_to_conversation(p_conversation_id, actor_id) then
    raise exception 'Active conversation membership is required.' using errcode = '42501';
  end if;
  if p_kind is null
    or (p_kind = 'system')
    or (p_kind = 'text' and char_length(btrim(coalesce(p_body, ''))) not between 1 and 5000)
    or (p_kind <> 'text' and p_body is not null and char_length(p_body) > 5000) then
    raise exception 'Invalid message payload.' using errcode = '22023';
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
    select * into message_record
    from public.messages
    where conversation_id = p_conversation_id
      and sender_id = actor_id
      and client_message_id = p_client_message_id;

    if found then
      if message_record.kind <> p_kind
        or message_record.body is distinct from (
          case when p_body is null then null else nullif(btrim(p_body), '') end
        )
        or message_record.reply_to_message_id is distinct from p_reply_to_message_id then
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
    reply_to_message_id
  )
  values (
    p_conversation_id,
    actor_id,
    p_client_message_id,
    p_kind,
    case when p_body is null then null else nullif(btrim(p_body), '') end,
    p_reply_to_message_id
  ) returning * into message_record;

  update public.conversations
  set updated_at = timezone('utc', now())
  where id = p_conversation_id;

  insert into public.message_receipts (message_id, profile_id, delivered_at)
  select message_record.id, member.profile_id, null
  from public.conversation_members as member
  where member.conversation_id = p_conversation_id
    and member.status = 'active'
    and member.profile_id <> actor_id
  on conflict do nothing;

  insert into public.notifications (recipient_id, actor_id, type, entity_type, entity_id, payload, dedupe_key)
  select
    member.profile_id,
    actor_id,
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
    and member.profile_id <> actor_id
    and preference.messages_enabled
    and coalesce(conversation_preference.notifications_enabled, true)
    and (conversation_preference.muted_until is null or conversation_preference.muted_until <= timezone('utc', now()))
  on conflict do nothing;

  return message_record;
end;
$$;

create or replace function public.edit_message(p_message_id uuid, p_body text)
returns public.messages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  message_record public.messages;
begin
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 5000 then
    raise exception 'Invalid message body.' using errcode = '22023';
  end if;

  update public.messages
  set body = btrim(p_body), edited_at = timezone('utc', now())
  where id = p_message_id
    and sender_id = actor_id
    and kind = 'text'
    and deleted_at is null
    and created_at >= timezone('utc', now()) - interval '24 hours'
  returning * into message_record;

  if not found then
    raise exception 'Editable message not found.' using errcode = 'P0002';
  end if;
  return message_record;
end;
$$;

create or replace function private.mark_message_attachment_tree_removed(p_message_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  with recursive removed_attachments(id) as (
    select attachment.id
    from public.message_attachments as attachment
    where attachment.message_id = p_message_id

    union

    select forwarded.id
    from public.message_attachments as forwarded
    join removed_attachments as parent
      on forwarded.forwarded_from_attachment_id = parent.id
  )
  update public.message_attachments as attachment
  set removed_at = coalesce(attachment.removed_at, timezone('utc', now())),
      cleanup_requested_at = coalesce(attachment.cleanup_requested_at, timezone('utc', now()))
  from removed_attachments
  where attachment.id = removed_attachments.id;

  get diagnostics affected = row_count;

  update public.messages as message
  set body = null,
      deleted_at = timezone('utc', now())
  where message.deleted_at is null
    and exists (
      select 1
      from public.message_attachments as removed
      where removed.message_id = message.id
        and removed.removed_at is not null
    )
    and not exists (
      select 1
      from public.message_attachments as active
      where active.message_id = message.id
        and active.removed_at is null
    );

  return affected;
end;
$$;

create or replace function public.delete_message(p_message_id uuid)
returns public.messages
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  message_record public.messages;
begin
  update public.messages
  set body = null, deleted_at = timezone('utc', now())
  where id = p_message_id
    and sender_id = actor_id
    and deleted_at is null
  returning * into message_record;

  if not found then
    raise exception 'Message not found.' using errcode = 'P0002';
  end if;
  perform private.mark_message_attachment_tree_removed(message_record.id);
  return message_record;
end;
$$;

create or replace function public.mark_message_read(p_message_id uuid)
returns public.message_receipts
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  conversation_id uuid;
  receipt public.message_receipts;
begin
  select message.conversation_id into conversation_id
  from public.messages as message
  where message.id = p_message_id;

  if conversation_id is null or not private.is_conversation_member(conversation_id, actor_id, false) then
    raise exception 'Message is unavailable.' using errcode = '42501';
  end if;

  insert into public.message_receipts (message_id, profile_id, delivered_at, read_at)
  values (p_message_id, actor_id, timezone('utc', now()), timezone('utc', now()))
  on conflict (message_id, profile_id) do update
    set delivered_at = coalesce(message_receipts.delivered_at, excluded.delivered_at),
        read_at = excluded.read_at
  returning * into receipt;

  return receipt;
end;
$$;

create or replace function public.mark_message_delivered(p_message_id uuid)
returns public.message_receipts
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  conversation_id uuid;
  receipt public.message_receipts;
begin
  select message.conversation_id into conversation_id
  from public.messages as message
  where message.id = p_message_id;

  if conversation_id is null or not private.is_conversation_member(conversation_id, actor_id, false) then
    raise exception 'Message is unavailable.' using errcode = '42501';
  end if;

  insert into public.message_receipts (message_id, profile_id, delivered_at)
  values (p_message_id, actor_id, timezone('utc', now()))
  on conflict (message_id, profile_id) do update
    set delivered_at = coalesce(message_receipts.delivered_at, excluded.delivered_at)
  returning * into receipt;

  return receipt;
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
  where id = p_source_message_id
    and deleted_at is null;

  if not found
    or source_message.kind = 'system'
    or not private.is_conversation_member(source_message.conversation_id, actor_id, false)
    or not private.can_send_to_conversation(p_target_conversation_id, actor_id) then
    raise exception 'The source or target conversation is unavailable.' using errcode = '42501';
  end if;

  if source_message.kind <> 'text' and not exists (
    select 1
    from public.message_attachments
    where message_id = source_message.id
      and removed_at is null
  ) then
    raise exception 'The source attachment is unavailable.' using errcode = 'P0002';
  end if;

  forwarded_message := public.send_message(
    p_target_conversation_id,
    source_message.kind,
    source_message.body,
    null,
    p_client_message_id
  );

  if forwarded_message.forwarded_from_message_id is not null
    and forwarded_message.forwarded_from_message_id <> source_message.id then
    raise exception 'The client message identifier is already bound to another forward.' using errcode = '23505';
  end if;

  update public.messages
  set forwarded_from_message_id = source_message.id
  where id = forwarded_message.id
    and (forwarded_from_message_id is null or forwarded_from_message_id = source_message.id)
  returning * into forwarded_message;

  insert into public.message_attachments (
    message_id,
    forwarded_from_attachment_id,
    owner_id,
    bucket_id,
    object_path,
    mime_type,
    byte_size,
    duration_seconds,
    waveform,
    width,
    height
  )
  select
    forwarded_message.id,
    attachment.id,
    attachment.owner_id,
    attachment.bucket_id,
    attachment.object_path,
    attachment.mime_type,
    attachment.byte_size,
    attachment.duration_seconds,
    attachment.waveform,
    attachment.width,
    attachment.height
  from public.message_attachments as attachment
  where attachment.message_id = source_message.id
    and attachment.removed_at is null
  on conflict (message_id, forwarded_from_attachment_id) do nothing;

  return forwarded_message;
end;
$$;

create or replace function private.can_manage_group(
  p_conversation_id uuid,
  p_actor_id uuid default auth.uid(),
  p_owner_only boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.account_access_enabled(p_actor_id) and exists (
    select 1
    from public.conversations as conversation
    join public.conversation_members as member on member.conversation_id = conversation.id
    where conversation.id = p_conversation_id
      and conversation.kind = 'group'
      and member.profile_id = p_actor_id
      and member.status = 'active'
      and (
        member.role = 'owner'
        or (not p_owner_only and member.role = 'admin')
      )
  );
$$;

create or replace function public.invite_group_members(p_conversation_id uuid, p_member_ids uuid[])
returns setof public.conversation_members
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  supplied_count integer := coalesce(cardinality(p_member_ids), 0);
  current_count integer;
  new_member_count integer;
  valid_count integer;
begin
  if not private.can_manage_group(p_conversation_id, actor_id, false) then
    raise exception 'Group management permission required.' using errcode = '42501';
  end if;
  if supplied_count not between 1 and 49
    or supplied_count <> (select count(distinct member_id) from unnest(p_member_ids) as member(member_id))
    or actor_id = any(p_member_ids) then
    raise exception 'Invite one to forty-nine unique profiles.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_conversation_id::text, 0));

  select count(*) into current_count
  from public.conversation_members
  where conversation_id = p_conversation_id
    and status in ('active', 'invited');

  select count(*) into new_member_count
  from unnest(p_member_ids) as candidate(member_id)
  where not exists (
    select 1
    from public.conversation_members
    where conversation_id = p_conversation_id
      and profile_id = candidate.member_id
      and status in ('active', 'invited')
  );

  if current_count + new_member_count > 50 then
    raise exception 'Groups are limited to fifty active or invited members.' using errcode = '23514';
  end if;

  select count(*) into valid_count
  from public.profiles
  where id = any(p_member_ids)
    and onboarding_completed_at is not null
    and not private.is_blocked_between(actor_id, id);
  if valid_count <> supplied_count then
    raise exception 'One or more invitees are unavailable.' using errcode = '42501';
  end if;

  insert into public.conversation_members (conversation_id, profile_id, role, status)
  select p_conversation_id, member_id, 'member', 'invited'
  from unnest(p_member_ids) as member(member_id)
  on conflict (conversation_id, profile_id) do update
    set role = case
          when conversation_members.role = 'owner' then 'owner'::public.conversation_member_role
          else 'member'::public.conversation_member_role
        end,
        status = (case
          when conversation_members.role = 'owner' then conversation_members.status
          when conversation_members.status = 'active' then 'active'::public.conversation_member_status
          else 'invited'::public.conversation_member_status
        end)::public.conversation_member_status,
        joined_at = case
          when conversation_members.status = 'active' then conversation_members.joined_at
          else null
        end;

  insert into public.conversation_preferences (conversation_id, profile_id)
  select p_conversation_id, member_id
  from unnest(p_member_ids) as member(member_id)
  on conflict (conversation_id, profile_id) do nothing;

  perform private.enqueue_notification(
    member.profile_id,
    actor_id,
    'group_invitation',
    'conversation',
    p_conversation_id,
    '{}'::jsonb,
    'group_invitation:' || p_conversation_id::text || ':' || member.profile_id::text,
    'messages'
  )
  from public.conversation_members as member
  where member.conversation_id = p_conversation_id
    and member.profile_id = any(p_member_ids)
    and member.status = 'invited';

  return query
  select member.*
  from public.conversation_members as member
  where member.conversation_id = p_conversation_id
    and member.profile_id = any(p_member_ids)
  order by member.created_at, member.profile_id;
end;
$$;

create or replace function public.remove_group_member(p_conversation_id uuid, p_profile_id uuid)
returns public.conversation_members
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.conversation_member_role;
  target_member public.conversation_members;
begin
  if not private.can_manage_group(p_conversation_id, actor_id, false) then
    raise exception 'Group management permission required.' using errcode = '42501';
  end if;

  select role into actor_role
  from public.conversation_members
  where conversation_id = p_conversation_id and profile_id = actor_id and status = 'active';

  select * into target_member
  from public.conversation_members
  where conversation_id = p_conversation_id
    and profile_id = p_profile_id
    and status in ('active', 'invited')
  for update;

  if not found
    or target_member.role = 'owner'
    or (actor_role = 'admin' and target_member.role = 'admin') then
    raise exception 'This group member cannot be removed by the current actor.' using errcode = '42501';
  end if;

  update public.conversation_members
  set status = 'removed', joined_at = null
  where conversation_id = p_conversation_id and profile_id = p_profile_id
  returning * into target_member;

  return target_member;
end;
$$;

create or replace function public.set_group_member_role(
  p_conversation_id uuid,
  p_profile_id uuid,
  p_role public.conversation_member_role
)
returns public.conversation_members
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_member public.conversation_members;
begin
  if not private.can_manage_group(p_conversation_id, actor_id, true) then
    raise exception 'Group owner permission required.' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'member') or p_profile_id = actor_id then
    raise exception 'Choose another active member and the admin or member role.' using errcode = '22023';
  end if;

  update public.conversation_members
  set role = p_role
  where conversation_id = p_conversation_id
    and profile_id = p_profile_id
    and status = 'active'
    and role <> 'owner'
  returning * into target_member;

  if not found then
    raise exception 'Active group member not found.' using errcode = 'P0002';
  end if;
  return target_member;
end;
$$;

create or replace function public.mark_notifications_read(p_notification_ids uuid[] default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  affected integer;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_notification_ids is not null and cardinality(p_notification_ids) > 100 then
    raise exception 'At most one hundred notifications can be updated at once.' using errcode = '22023';
  end if;

  update public.notifications
  set read_at = timezone('utc', now())
  where recipient_id = actor_id
    and read_at is null
    and (p_notification_ids is null or id = any(p_notification_ids));

  get diagnostics affected = row_count;
  return affected;
end;
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
    select 1
    from public.message_attachments
    where forwarded_from_attachment_id = attachment_record.id
  ) then
    raise exception 'Forwarded attachment references must be cleaned first.' using errcode = '55000';
  end if;

  deletes_object := attachment_record.forwarded_from_attachment_id is null;
  if deletes_object and exists (
    select 1
    from storage.objects
    where bucket_id = attachment_record.bucket_id
      and name = attachment_record.object_path
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
      'deleted_object', deletes_object
    )
  );
end;
$$;

revoke all on function private.enqueue_notification(uuid, uuid, text, text, uuid, jsonb, text, text) from public, anon, authenticated;
revoke all on function private.ensure_direct_conversation(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.request_conversation(uuid, text) from public, anon;
revoke all on function public.respond_to_conversation_request(uuid, boolean) from public, anon;
revoke all on function public.create_group_conversation(text, uuid[]) from public, anon;
revoke all on function public.respond_to_group_invitation(uuid, boolean) from public, anon;
revoke all on function public.send_message(uuid, public.message_kind, text, uuid, uuid) from public, anon;
revoke all on function public.edit_message(uuid, text) from public, anon;
revoke all on function public.delete_message(uuid) from public, anon;
revoke all on function private.mark_message_attachment_tree_removed(uuid) from public, anon, authenticated;
revoke all on function public.mark_message_read(uuid) from public, anon;
revoke all on function public.mark_message_delivered(uuid) from public, anon;
revoke all on function public.forward_message(uuid, uuid, uuid) from public, anon;
revoke all on function private.can_manage_group(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.invite_group_members(uuid, uuid[]) from public, anon;
revoke all on function public.remove_group_member(uuid, uuid) from public, anon;
revoke all on function public.set_group_member_role(uuid, uuid, public.conversation_member_role) from public, anon;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
revoke all on function public.list_message_attachment_cleanup(integer) from public, anon, authenticated;
revoke all on function public.complete_message_attachment_cleanup(uuid) from public, anon, authenticated;
grant execute on function public.request_conversation(uuid, text) to authenticated;
grant execute on function public.respond_to_conversation_request(uuid, boolean) to authenticated;
grant execute on function public.create_group_conversation(text, uuid[]) to authenticated;
grant execute on function public.respond_to_group_invitation(uuid, boolean) to authenticated;
grant execute on function public.send_message(uuid, public.message_kind, text, uuid, uuid) to authenticated;
grant execute on function public.edit_message(uuid, text) to authenticated;
grant execute on function public.delete_message(uuid) to authenticated;
grant execute on function public.mark_message_read(uuid) to authenticated;
grant execute on function public.mark_message_delivered(uuid) to authenticated;
grant execute on function public.forward_message(uuid, uuid, uuid) to authenticated;
grant execute on function private.can_manage_group(uuid, uuid, boolean) to authenticated, service_role;
grant execute on function public.invite_group_members(uuid, uuid[]) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.set_group_member_role(uuid, uuid, public.conversation_member_role) to authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.list_message_attachment_cleanup(integer) to service_role;
grant execute on function public.complete_message_attachment_cleanup(uuid) to service_role;

create or replace function public.create_report(
  p_target_type public.report_target_type,
  p_target_id uuid,
  p_category text,
  p_details text default null
)
returns public.reports
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  report_record public.reports;
  target_owner_id uuid;
  target_exists boolean := false;
  target_conversation_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_target_type is null or p_target_id is null
    or coalesce(p_category, '') !~ '^[a-z][a-z0-9_]{1,49}$'
    or (p_details is not null and char_length(p_details) > 2000) then
    raise exception 'Invalid report payload.' using errcode = '22023';
  end if;

  case p_target_type
    when 'profile' then
      select true, id into target_exists, target_owner_id
      from public.profiles where id = p_target_id;
    when 'community' then
      select true, owner_id into target_exists, target_owner_id
      from public.communities where id = p_target_id;
    when 'community_post' then
      select true, author_id into target_exists, target_owner_id
      from public.community_posts where id = p_target_id;
    when 'post_comment' then
      select true, author_id into target_exists, target_owner_id
      from public.post_comments where id = p_target_id;
    when 'message' then
      select true, sender_id, conversation_id
      into target_exists, target_owner_id, target_conversation_id
      from public.messages where id = p_target_id;
      if target_exists and not private.is_conversation_member(target_conversation_id, actor_id, false) then
        raise exception 'Message is unavailable.' using errcode = '42501';
      end if;
  end case;

  if not coalesce(target_exists, false) then
    raise exception 'Report target not found.' using errcode = 'P0002';
  end if;
  if target_owner_id = actor_id then
    raise exception 'You cannot report your own content.' using errcode = '22023';
  end if;

  select * into report_record
  from public.reports
  where reporter_id = actor_id
    and target_type = p_target_type
    and target_id = p_target_id
    and status in ('open', 'in_review')
  order by created_at desc
  limit 1;

  if found then
    return report_record;
  end if;

  insert into public.reports (reporter_id, target_type, target_id, category, details)
  values (actor_id, p_target_type, p_target_id, p_category, nullif(btrim(p_details), ''))
  returning * into report_record;

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

  return report_record;
end;
$$;

create or replace function public.claim_moderation_case(p_case_id uuid)
returns public.moderation_cases
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  case_record public.moderation_cases;
begin
  if not private.is_moderator(actor_id) then
    raise exception 'Moderation permission required.' using errcode = '42501';
  end if;

  update public.moderation_cases
  set assigned_to = actor_id, status = 'in_review'
  where id = p_case_id
    and status in ('open', 'in_review')
    and (assigned_to is null or assigned_to = actor_id)
  returning * into case_record;

  if not found then
    raise exception 'Moderation case is unavailable.' using errcode = 'P0002';
  end if;

  update public.reports
  set assigned_to = actor_id, status = 'in_review'
  where id = case_record.report_id;

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (actor_id, 'moderation.case_claimed', 'moderation_case', case_record.id, '{}'::jsonb);

  return case_record;
end;
$$;

-- A moderator may inspect only the reported object, never the surrounding private thread.
-- The projection deliberately omits Storage paths, profile location, birth date, and unrelated messages.
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
  context_owner_id uuid;
  context_text text;
  context_kind text;
  context_created_at timestamptz;
  context_attachment_ids uuid[] := '{}'::uuid[];
begin
  if not private.is_moderator(actor_id) then
    raise exception 'Moderation permission required.' using errcode = '42501';
  end if;

  select * into report_record
  from public.reports
  where id = p_report_id;

  if not found then
    raise exception 'Report not found.' using errcode = 'P0002';
  end if;

  case report_record.target_type
    when 'profile' then
      select
        profile.id,
        concat_ws(E'\n', profile.full_name, '@' || profile.username::text, profile.bio),
        'profile',
        profile.created_at
      into context_owner_id, context_text, context_kind, context_created_at
      from public.profiles as profile
      where profile.id = report_record.target_id;
    when 'community' then
      select community.owner_id, community.description, 'community', community.created_at
      into context_owner_id, context_text, context_kind, context_created_at
      from public.communities as community
      where community.id = report_record.target_id;
    when 'community_post' then
      select
        post.author_id,
        post.body,
        'community_post',
        post.created_at,
        coalesce(array_agg(media.id order by media.sort_order) filter (where media.id is not null), '{}'::uuid[])
      into context_owner_id, context_text, context_kind, context_created_at, context_attachment_ids
      from public.community_posts as post
      left join public.post_media as media
        on media.post_id = post.id
       and media.status = 'ready'
       and post.status = 'active'
      where post.id = report_record.target_id
      group by post.id;
    when 'post_comment' then
      select comment.author_id, comment.body, 'post_comment', comment.created_at
      into context_owner_id, context_text, context_kind, context_created_at
      from public.post_comments as comment
      where comment.id = report_record.target_id;
    when 'message' then
      select
        message.sender_id,
        message.body,
        message.kind::text,
        message.created_at,
        coalesce(array_agg(attachment.id order by attachment.created_at) filter (where attachment.id is not null), '{}'::uuid[])
      into context_owner_id, context_text, context_kind, context_created_at, context_attachment_ids
      from public.messages as message
      left join public.message_attachments as attachment
        on attachment.message_id = message.id
       and attachment.removed_at is null
       and message.deleted_at is null
      where message.id = report_record.target_id
      group by message.id;
  end case;

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (
    actor_id,
    'moderation.report_context_viewed',
    report_record.target_type::text,
    report_record.target_id,
    jsonb_build_object('report_id', report_record.id)
  );

  return query select
    report_record.id,
    report_record.target_type,
    report_record.target_id,
    context_owner_id,
    context_text,
    context_kind,
    context_created_at,
    context_attachment_ids;
end;
$$;

-- Metadata/path access is a separate audited step so a moderator can request the single reported
-- object through the private Storage API without receiving any surrounding conversation media.
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
  attachment_exists boolean := false;
begin
  if not private.is_moderator(actor_id) then
    raise exception 'Moderation permission required.' using errcode = '42501';
  end if;

  select * into report_record
  from public.reports
  where id = p_report_id;

  if not found then
    raise exception 'Report not found.' using errcode = 'P0002';
  end if;

  if report_record.target_type = 'message' then
    select exists (
      select 1
      from public.message_attachments as attachment
      join public.messages as message on message.id = attachment.message_id
      where attachment.id = p_attachment_id
        and attachment.message_id = report_record.target_id
        and attachment.removed_at is null
        and message.deleted_at is null
    ) into attachment_exists;
  elsif report_record.target_type = 'community_post' then
    select exists (
      select 1
      from public.post_media as media
      join public.community_posts as post on post.id = media.post_id
      where media.id = p_attachment_id
        and media.post_id = report_record.target_id
        and media.status = 'ready'
        and post.status = 'active'
    ) into attachment_exists;
  end if;

  if not attachment_exists then
    raise exception 'Reported attachment not found.' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (
    actor_id,
    'moderation.report_attachment_viewed',
    report_record.target_type::text,
    report_record.target_id,
    jsonb_build_object('report_id', report_record.id, 'attachment_id', p_attachment_id)
  );

  if report_record.target_type = 'message' then
    return query
    select
      attachment.id,
      'message_attachment'::text,
      attachment.bucket_id,
      attachment.object_path,
      attachment.mime_type,
      attachment.byte_size,
      attachment.duration_seconds,
      attachment.waveform,
      attachment.width,
      attachment.height
    from public.message_attachments as attachment
    join public.messages as message on message.id = attachment.message_id
    where attachment.id = p_attachment_id
      and attachment.removed_at is null
      and message.deleted_at is null;
  else
    return query
    select
      media.id,
      'post_media'::text,
      media.bucket_id,
      media.object_path,
      media.mime_type,
      media.byte_size,
      null::numeric,
      null::jsonb,
      media.width,
      media.height
    from public.post_media as media
    join public.community_posts as post on post.id = media.post_id
    where media.id = p_attachment_id
      and media.status = 'ready'
      and post.status = 'active';
  end if;
end;
$$;

create or replace function public.apply_moderation_action(
  p_report_id uuid,
  p_action_type public.moderation_action_type,
  p_reason text,
  p_expires_at timestamptz default null
)
returns public.sanctions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  report_record public.reports;
  case_record public.moderation_cases;
  sanction_record public.sanctions;
  target_profile_id uuid;
begin
  if not private.is_moderator(actor_id) then
    raise exception 'Moderation permission required.' using errcode = '42501';
  end if;
  if p_action_type is null
    or char_length(btrim(coalesce(p_reason, ''))) not between 3 and 2000
    or (p_expires_at is not null and p_expires_at <= timezone('utc', now())) then
    raise exception 'Invalid moderation action.' using errcode = '22023';
  end if;

  select * into report_record
  from public.reports
  where id = p_report_id
    and status in ('open', 'in_review')
  for update;
  if not found then
    raise exception 'Open report not found.' using errcode = 'P0002';
  end if;

  select * into case_record
  from public.moderation_cases
  where report_id = report_record.id
  for update;
  if not found then
    insert into public.moderation_cases (report_id, assigned_to, status)
    values (report_record.id, actor_id, 'in_review')
    returning * into case_record;
  end if;

  case report_record.target_type
    when 'profile' then
      target_profile_id := report_record.target_id;
    when 'community' then
      select owner_id into target_profile_id from public.communities where id = report_record.target_id;
    when 'community_post' then
      select author_id into target_profile_id from public.community_posts where id = report_record.target_id;
    when 'post_comment' then
      select author_id into target_profile_id from public.post_comments where id = report_record.target_id;
    when 'message' then
      select sender_id into target_profile_id from public.messages where id = report_record.target_id;
  end case;

  if p_action_type in ('hide_content', 'remove_content') then
    if report_record.target_type = 'community_post' then
      update public.community_posts
      set status = (case when p_action_type = 'hide_content' then 'hidden' else 'removed' end)::public.content_status
      where id = report_record.target_id;

      if p_action_type = 'remove_content' then
        update public.post_media
        set status = 'deleting'
        where post_id = report_record.target_id
          and status in ('pending', 'ready', 'failed');
      end if;
    elsif report_record.target_type = 'post_comment' then
      update public.post_comments
      set status = (case when p_action_type = 'hide_content' then 'hidden' else 'removed' end)::public.content_status
      where id = report_record.target_id;
    elsif report_record.target_type = 'message' then
      update public.messages
      set body = null, deleted_at = timezone('utc', now())
      where id = report_record.target_id and deleted_at is null;

      perform private.mark_message_attachment_tree_removed(report_record.target_id);
    elsif report_record.target_type = 'community' then
      update public.communities
      set archived_at = timezone('utc', now())
      where id = report_record.target_id and archived_at is null;
    else
      raise exception 'This action is incompatible with the report target.' using errcode = '22023';
    end if;
  elsif p_action_type in ('warn', 'restrict', 'suspend', 'ban') then
    if target_profile_id is null then
      raise exception 'The target profile is unavailable.' using errcode = 'P0002';
    end if;

    if p_action_type in ('restrict', 'suspend', 'ban') then
      insert into public.profile_moderation_state (profile_id, status, public_reason, restricted_until)
      values (
        target_profile_id,
        case p_action_type
          when 'restrict' then 'restricted'::public.profile_account_status
          when 'suspend' then 'suspended'::public.profile_account_status
          when 'ban' then 'banned'::public.profile_account_status
        end,
        btrim(p_reason),
        case when p_action_type in ('restrict', 'suspend') then p_expires_at else null end
      )
      on conflict (profile_id) do update
        set status = excluded.status,
            public_reason = excluded.public_reason,
            restricted_until = excluded.restricted_until;
    end if;

    perform private.enqueue_notification(
      target_profile_id,
      actor_id,
      'moderation_action',
      'report',
      report_record.id,
      jsonb_build_object('action', p_action_type::text),
      'moderation_action:' || report_record.id::text,
      'system'
    );
  end if;

  insert into public.sanctions (
    case_id,
    imposed_by,
    target_type,
    target_id,
    action_type,
    reason,
    expires_at,
    metadata
  ) values (
    case_record.id,
    actor_id,
    report_record.target_type,
    report_record.target_id,
    p_action_type,
    btrim(p_reason),
    p_expires_at,
    jsonb_build_object('subject_profile_id', target_profile_id)
  ) returning * into sanction_record;

  update public.reports
  set status = (case when p_action_type = 'dismiss' then 'dismissed' else 'resolved' end)::public.report_status,
      assigned_to = actor_id,
      resolution = btrim(p_reason),
      resolved_at = timezone('utc', now())
  where id = report_record.id;

  update public.moderation_cases
  set status = (case when p_action_type = 'dismiss' then 'dismissed' else 'resolved' end)::public.report_status,
      assigned_to = actor_id,
      resolution = btrim(p_reason),
      resolved_at = timezone('utc', now())
  where id = case_record.id;

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (
    actor_id,
    'moderation.action_applied',
    report_record.target_type::text,
    report_record.target_id,
    jsonb_build_object(
      'report_id', report_record.id,
      'case_id', case_record.id,
      'sanction_id', sanction_record.id,
      'action', p_action_type::text
    )
  );

  return sanction_record;
end;
$$;

revoke all on function public.create_report(public.report_target_type, uuid, text, text) from public, anon;
revoke all on function public.claim_moderation_case(uuid) from public, anon, authenticated;
revoke all on function public.get_moderation_report_context(uuid) from public, anon, authenticated;
revoke all on function public.get_moderation_report_attachment(uuid, uuid) from public, anon, authenticated;
revoke all on function public.apply_moderation_action(uuid, public.moderation_action_type, text, timestamptz) from public, anon, authenticated;
grant execute on function public.create_report(public.report_target_type, uuid, text, text) to authenticated;
grant execute on function public.claim_moderation_case(uuid) to authenticated;
grant execute on function public.get_moderation_report_context(uuid) to authenticated;
grant execute on function public.get_moderation_report_attachment(uuid, uuid) to authenticated;
grant execute on function public.apply_moderation_action(uuid, public.moderation_action_type, text, timestamptz) to authenticated;

create or replace function public.request_account_lifecycle(
  p_kind public.account_lifecycle_kind,
  p_confirmation text default null
)
returns public.account_lifecycle_requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  token_issued_at timestamptz;
  lifecycle_record public.account_lifecycle_requests;
begin
  if actor_id is null or p_kind is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_kind in ('deactivate', 'delete') then
    if p_confirmation is distinct from 'CONFIRMAR' then
      raise exception 'Explicit confirmation is required.' using errcode = '22023';
    end if;

    begin
      token_issued_at := to_timestamp((auth.jwt() ->> 'iat')::double precision);
    exception when others then
      token_issued_at := null;
    end;

    if token_issued_at is null or token_issued_at < timezone('utc', now()) - interval '10 minutes' then
      raise exception 'A recently issued authentication token is required.' using errcode = '42501';
    end if;
  end if;

  select * into lifecycle_record
  from public.account_lifecycle_requests
  where user_id = actor_id
    and kind = p_kind
    and status in ('pending', 'processing')
  for update;

  if found then
    return lifecycle_record;
  end if;

  insert into public.account_lifecycle_requests (user_id, kind, execute_after)
  values (
    actor_id,
    p_kind,
    case
      when p_kind = 'delete' then timezone('utc', now()) + interval '30 days'
      else timezone('utc', now())
    end
  )
  returning * into lifecycle_record;

  if p_kind in ('deactivate', 'delete') then
    update public.profile_moderation_state
    set status = 'restricted',
        public_reason = 'account_lifecycle:' || p_kind::text || ':' || lifecycle_record.id::text,
        restricted_until = case when p_kind = 'delete' then lifecycle_record.execute_after else null end
    where profile_id = actor_id
      and status = 'active';
  end if;

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (
    actor_id,
    'account.lifecycle_requested',
    'account_lifecycle_request',
    lifecycle_record.id,
    jsonb_build_object('kind', p_kind::text, 'execute_after', lifecycle_record.execute_after)
  );

  return lifecycle_record;
end;
$$;

create or replace function public.cancel_account_lifecycle(p_request_id uuid)
returns public.account_lifecycle_requests
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  lifecycle_record public.account_lifecycle_requests;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  update public.account_lifecycle_requests
  set status = 'cancelled', cancelled_at = timezone('utc', now())
  where id = p_request_id
    and user_id = actor_id
    and status = 'pending'
  returning * into lifecycle_record;

  if not found then
    raise exception 'Pending account request not found.' using errcode = 'P0002';
  end if;

  if lifecycle_record.kind in ('deactivate', 'delete') then
    update public.profile_moderation_state
    set status = 'active', public_reason = null, restricted_until = null
    where profile_id = actor_id
      and status = 'restricted'
      and public_reason = 'account_lifecycle:' || lifecycle_record.kind::text || ':' || lifecycle_record.id::text;
  end if;

  insert into public.audit_logs (actor_id, event_type, target_type, target_id, metadata)
  values (
    actor_id,
    'account.lifecycle_cancelled',
    'account_lifecycle_request',
    lifecycle_record.id,
    jsonb_build_object('kind', lifecycle_record.kind::text)
  );

  return lifecycle_record;
end;
$$;

revoke all on function public.request_account_lifecycle(public.account_lifecycle_kind, text) from public, anon;
revoke all on function public.cancel_account_lifecycle(uuid) from public, anon;
grant execute on function public.request_account_lifecycle(public.account_lifecycle_kind, text) to authenticated;
grant execute on function public.cancel_account_lifecycle(uuid) to authenticated;

-- Every launch table is private by default; policies below open only explicit authenticated paths.
alter table public.profile_moderation_state enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.user_settings enable row level security;
alter table public.account_lifecycle_requests enable row level security;
alter table public.blocks enable row level security;
alter table public.profile_media enable row level security;
alter table public.communities enable row level security;
alter table public.community_memberships enable row level security;
alter table public.community_rules enable row level security;
alter table public.community_posts enable row level security;
alter table public.post_media enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_reactions enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.conversation_preferences enable row level security;
alter table public.conversation_requests enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.message_attachments enable row level security;
alter table public.message_receipts enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.report_evidence enable row level security;
alter table public.moderation_cases enable row level security;
alter table public.sanctions enable row level security;
alter table public.audit_logs enable row level security;

create policy "Users can view their own moderation state"
on public.profile_moderation_state for select to authenticated
using (profile_id = (select auth.uid()) or private.is_moderator((select auth.uid())));

create policy "Users can view their own notification preferences"
on public.notification_preferences for select to authenticated
using (profile_id = (select auth.uid()));

create policy "Users can update their own notification preferences"
on public.notification_preferences for update to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

create policy "Users can view their own settings"
on public.user_settings for select to authenticated
using (profile_id = (select auth.uid()));

create policy "Users can update their own settings"
on public.user_settings for update to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

create policy "Owners and moderators can view account lifecycle requests"
on public.account_lifecycle_requests for select to authenticated
using (user_id = (select auth.uid()) or private.is_moderator((select auth.uid())));

create policy "Blockers can view blocks they created"
on public.blocks for select to authenticated
using (blocker_id = (select auth.uid()));

create policy "Profiles can view permitted profile media"
on public.profile_media for select to authenticated
using (
  profile_id = (select auth.uid())
  or (
    status = 'ready'
    and private.can_view_profile_media(profile_id, purpose, (select auth.uid()))
  )
);

create policy "Members can view available communities"
on public.communities for select to authenticated
using (
  private.account_access_enabled((select auth.uid()))
  and archived_at is null
  and (
    visibility = 'public'
    or private.is_active_community_member(id, (select auth.uid()))
    or private.is_moderator((select auth.uid()))
  )
);

create policy "Community managers can update communities"
on public.communities for update to authenticated
using (private.can_manage_community(id, (select auth.uid())))
with check (private.can_manage_community(id, (select auth.uid())));

create policy "Community memberships are visible in context"
on public.community_memberships for select to authenticated
using (
  private.account_access_enabled((select auth.uid()))
  and (
    profile_id = (select auth.uid())
    or private.is_active_community_member(community_id, (select auth.uid()))
    or exists (
      select 1 from public.communities
      where id = community_memberships.community_id
        and visibility = 'public'
        and archived_at is null
    )
    or private.is_moderator((select auth.uid()))
  )
);

create policy "Community rules are visible with the community"
on public.community_rules for select to authenticated
using (
  private.account_access_enabled((select auth.uid()))
  and (
    private.is_active_community_member(community_id, (select auth.uid()))
    or exists (
      select 1 from public.communities
      where id = community_rules.community_id
        and visibility = 'public'
        and archived_at is null
    )
    or private.is_moderator((select auth.uid()))
  )
);

create policy "Community managers can create rules"
on public.community_rules for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.can_manage_community(community_id, (select auth.uid()))
);

create policy "Community managers can update rules"
on public.community_rules for update to authenticated
using (private.can_manage_community(community_id, (select auth.uid())))
with check (private.can_manage_community(community_id, (select auth.uid())));

create policy "Community managers can delete rules"
on public.community_rules for delete to authenticated
using (private.can_manage_community(community_id, (select auth.uid())));

create policy "Users can view permitted community posts"
on public.community_posts for select to authenticated
using (
  private.can_view_community_post(id, (select auth.uid()))
  or author_id = (select auth.uid())
  or private.is_moderator((select auth.uid()))
);

create policy "Active profiles can create community posts"
on public.community_posts for insert to authenticated
with check (
  author_id = (select auth.uid())
  and private.is_socially_active((select auth.uid()))
  and (
    community_id is null
    or private.is_active_community_member(community_id, (select auth.uid()))
  )
);

create policy "Authors can edit community posts"
on public.community_posts for update to authenticated
using (author_id = (select auth.uid()) and status = 'active')
with check (
  author_id = (select auth.uid())
  and status = 'active'
  and private.is_socially_active((select auth.uid()))
);

create policy "Users can view permitted post media"
on public.post_media for select to authenticated
using (
  (
    status = 'ready'
    and private.can_view_community_post(post_id, (select auth.uid()))
  )
  or (
    owner_id = (select auth.uid())
    and status in ('pending', 'ready')
    and exists (
      select 1
      from public.community_posts
      where id = post_media.post_id
        and status = 'active'
    )
  )
  or private.is_moderator((select auth.uid()))
);

create policy "Users can view comments on permitted posts"
on public.post_comments for select to authenticated
using (
  (status = 'active' and private.can_view_community_post(post_id, (select auth.uid())))
  or author_id = (select auth.uid())
  or private.is_moderator((select auth.uid()))
);

create policy "Active profiles can create comments"
on public.post_comments for insert to authenticated
with check (
  author_id = (select auth.uid())
  and private.is_socially_active((select auth.uid()))
  and private.can_view_community_post(post_id, (select auth.uid()))
);

create policy "Comment authors can edit comments"
on public.post_comments for update to authenticated
using (author_id = (select auth.uid()) and status = 'active')
with check (
  author_id = (select auth.uid())
  and status = 'active'
  and private.is_socially_active((select auth.uid()))
);

create policy "Users can view reactions on permitted content"
on public.post_reactions for select to authenticated
using (
  (post_id is not null and private.can_view_community_post(post_id, (select auth.uid())))
  or (
    comment_id is not null
    and exists (
      select 1 from public.post_comments
      where id = post_reactions.comment_id
        and status = 'active'
        and private.can_view_community_post(post_id, (select auth.uid()))
    )
  )
  or reactor_id = (select auth.uid())
);

create policy "Active profiles can create post reactions"
on public.post_reactions for insert to authenticated
with check (
  reactor_id = (select auth.uid())
  and private.is_socially_active((select auth.uid()))
  and (
    (post_id is not null and private.can_view_community_post(post_id, (select auth.uid())))
    or (
      comment_id is not null
      and exists (
        select 1 from public.post_comments
        where id = post_reactions.comment_id
          and status = 'active'
          and private.can_view_community_post(post_id, (select auth.uid()))
      )
    )
  )
);

create policy "Users can update their own post reactions"
on public.post_reactions for update to authenticated
using (reactor_id = (select auth.uid()))
with check (reactor_id = (select auth.uid()));

create policy "Users can remove their own post reactions"
on public.post_reactions for delete to authenticated
using (reactor_id = (select auth.uid()));

create policy "Conversation participants can view conversations"
on public.conversations for select to authenticated
using (private.is_conversation_member(id, (select auth.uid()), true));

create policy "Conversation participants can view members"
on public.conversation_members for select to authenticated
using (private.is_conversation_member(conversation_id, (select auth.uid()), true));

create policy "Users can view their conversation preferences"
on public.conversation_preferences for select to authenticated
using (profile_id = (select auth.uid()));

create policy "Users can update their conversation preferences"
on public.conversation_preferences for update to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

create policy "Conversation request participants can view requests"
on public.conversation_requests for select to authenticated
using (
  requester_id = (select auth.uid())
  or recipient_id = (select auth.uid())
);

create policy "Active members can view messages"
on public.messages for select to authenticated
using (private.is_conversation_member(conversation_id, (select auth.uid()), false));

create policy "Active members can view message reactions"
on public.message_reactions for select to authenticated
using (
  exists (
    select 1 from public.messages
    where id = message_reactions.message_id
      and private.is_conversation_member(conversation_id, (select auth.uid()), false)
  )
);

create policy "Active members can create message reactions"
on public.message_reactions for insert to authenticated
with check (
  reactor_id = (select auth.uid())
  and private.is_socially_active((select auth.uid()))
  and exists (
    select 1 from public.messages
    where id = message_reactions.message_id
      and deleted_at is null
      and private.is_conversation_member(conversation_id, (select auth.uid()), false)
  )
);

create policy "Users can update their own message reactions"
on public.message_reactions for update to authenticated
using (reactor_id = (select auth.uid()))
with check (reactor_id = (select auth.uid()));

create policy "Users can remove their own message reactions"
on public.message_reactions for delete to authenticated
using (reactor_id = (select auth.uid()));

create policy "Active members can view message attachments"
on public.message_attachments for select to authenticated
using (
  removed_at is null
  and
  exists (
    select 1 from public.messages
    where id = message_attachments.message_id
      and deleted_at is null
      and private.is_conversation_member(conversation_id, (select auth.uid()), false)
  )
);

create policy "Message senders can add attachments"
on public.message_attachments for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1 from public.messages
    where id = message_attachments.message_id
      and sender_id = (select auth.uid())
      and deleted_at is null
      and private.can_send_to_conversation(conversation_id, (select auth.uid()))
  )
);

create policy "Message senders can remove attachments"
on public.message_attachments for delete to authenticated
using (
  owner_id = (select auth.uid())
  and removed_at is null
  and forwarded_from_attachment_id is null
  and exists (
    select 1 from public.messages
    where id = message_attachments.message_id
      and sender_id = (select auth.uid())
      and deleted_at is null
  )
);

create policy "Conversation members can view receipts"
on public.message_receipts for select to authenticated
using (
  exists (
    select 1 from public.messages
    where id = message_receipts.message_id
      and private.is_conversation_member(conversation_id, (select auth.uid()), false)
  )
);

create policy "Users can view their notifications"
on public.notifications for select to authenticated
using (recipient_id = (select auth.uid()));

create policy "Users can mark their notifications read"
on public.notifications for update to authenticated
using (recipient_id = (select auth.uid()))
with check (recipient_id = (select auth.uid()));

create policy "Reporters and moderators can view reports"
on public.reports for select to authenticated
using (reporter_id = (select auth.uid()) or private.is_moderator((select auth.uid())));

create policy "Moderators can view report evidence"
on public.report_evidence for select to authenticated
using (private.is_moderator((select auth.uid())));

create policy "Reporters can attach evidence to open reports"
on public.report_evidence for insert to authenticated
with check (
  uploader_id = (select auth.uid())
  and exists (
    select 1 from public.reports
    where id = report_evidence.report_id
      and reporter_id = (select auth.uid())
      and status in ('open', 'in_review')
  )
);

create policy "Moderators can view cases"
on public.moderation_cases for select to authenticated
using (private.is_moderator((select auth.uid())));

create policy "Moderators can view sanctions"
on public.sanctions for select to authenticated
using (private.is_moderator((select auth.uid())));

create policy "Moderators can view audit logs"
on public.audit_logs for select to authenticated
using (private.is_moderator((select auth.uid())));

revoke all on table
  public.profile_moderation_state,
  public.notification_preferences,
  public.user_settings,
  public.account_lifecycle_requests,
  public.blocks,
  public.profile_media,
  public.communities,
  public.community_memberships,
  public.community_rules,
  public.community_posts,
  public.post_media,
  public.post_comments,
  public.post_reactions,
  public.conversations,
  public.conversation_members,
  public.conversation_preferences,
  public.conversation_requests,
  public.messages,
  public.message_reactions,
  public.message_attachments,
  public.message_receipts,
  public.notifications,
  public.reports,
  public.report_evidence,
  public.moderation_cases,
  public.sanctions,
  public.audit_logs
from anon, authenticated;

grant select on table
  public.profile_moderation_state,
  public.notification_preferences,
  public.user_settings,
  public.account_lifecycle_requests,
  public.blocks,
  public.profile_media,
  public.communities,
  public.community_memberships,
  public.community_rules,
  public.community_posts,
  public.post_media,
  public.post_comments,
  public.post_reactions,
  public.conversations,
  public.conversation_members,
  public.conversation_preferences,
  public.conversation_requests,
  public.messages,
  public.message_reactions,
  public.message_attachments,
  public.message_receipts,
  public.notifications,
  public.reports,
  public.report_evidence,
  public.moderation_cases,
  public.sanctions,
  public.audit_logs
to authenticated;

grant update (
  social_enabled,
  messages_enabled,
  community_enabled,
  system_enabled,
  email_enabled,
  push_enabled,
  quiet_hours_start,
  quiet_hours_end
) on public.notification_preferences to authenticated;

grant update (locale, timezone_name, reduced_motion, high_contrast)
on public.user_settings to authenticated;

grant insert (author_id, community_id, body, visibility),
      update (body, visibility)
on public.community_posts to authenticated;

grant insert (post_id, author_id, parent_comment_id, body),
      update (body)
on public.post_comments to authenticated;

grant insert (reactor_id, post_id, comment_id, kind),
      update (kind),
      delete
on public.post_reactions to authenticated;

grant update (muted_until, archived_at, notifications_enabled, read_receipts_enabled)
on public.conversation_preferences to authenticated;

grant insert (message_id, reactor_id, kind), update (kind), delete
on public.message_reactions to authenticated;

grant insert (
  message_id,
  owner_id,
  bucket_id,
  object_path,
  mime_type,
  byte_size,
  duration_seconds,
  waveform,
  width,
  height
), delete on public.message_attachments to authenticated;

grant update (read_at) on public.notifications to authenticated;

grant insert (report_id, uploader_id, bucket_id, object_path, mime_type, byte_size)
on public.report_evidence to authenticated;

grant all on table
  public.profile_moderation_state,
  public.notification_preferences,
  public.user_settings,
  public.account_lifecycle_requests,
  public.blocks,
  public.profile_media,
  public.communities,
  public.community_memberships,
  public.community_rules,
  public.community_posts,
  public.post_media,
  public.post_comments,
  public.post_reactions,
  public.conversations,
  public.conversation_members,
  public.conversation_preferences,
  public.conversation_requests,
  public.messages,
  public.message_reactions,
  public.message_attachments,
  public.message_receipts,
  public.notifications,
  public.reports,
  public.report_evidence,
  public.moderation_cases,
  public.sanctions,
  public.audit_logs
to service_role;

grant usage, select on sequence public.audit_logs_id_seq to service_role;

-- Private Storage buckets. Object creation/removal stays on the Storage API; SQL only configures buckets and policies.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'profile-media',
    'profile-media',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'image/avif']::text[]
  ),
  (
    'community-media',
    'community-media',
    false,
    26214400,
    array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4']::text[]
  ),
  (
    'chat-media',
    'chat-media',
    false,
    26214400,
    array[
      'image/jpeg', 'image/png', 'image/webp', 'image/avif',
      'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav',
      'application/pdf'
    ]::text[]
  ),
  (
    'report-evidence',
    'report-evidence',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp']::text[]
  )
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.can_read_storage_object(
  p_bucket_id text,
  p_object_path text,
  p_viewer_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.account_access_enabled(p_viewer_id) and (
    (
      p_bucket_id = 'profile-media'
      and split_part(p_object_path, '/', 1) = p_viewer_id::text
    )
    or (
      p_bucket_id = 'chat-media'
      and split_part(p_object_path, '/', 1) = p_viewer_id::text
      and not exists (
        select 1
        from public.message_attachments as sanctioned
        where sanctioned.bucket_id = p_bucket_id
          and sanctioned.object_path = p_object_path
          and sanctioned.removed_at is not null
      )
    )
    or (
      p_bucket_id = 'profile-media'
      and exists (
        select 1
        from public.profile_media
        where bucket_id = p_bucket_id
          and object_path = p_object_path
          and status = 'ready'
          and private.can_view_profile_media(profile_id, purpose, p_viewer_id)
      )
    )
    or (
      p_bucket_id = 'community-media'
      and (
        exists (
          select 1
          from public.post_media
          where bucket_id = p_bucket_id
            and object_path = p_object_path
            and status = 'ready'
            and private.can_view_community_post(post_id, p_viewer_id)
        )
        or exists (
          select 1
          from public.communities
          where archived_at is null
            and p_object_path in (avatar_path, cover_path)
            and (
              visibility = 'public'
              or private.is_active_community_member(id, p_viewer_id)
              or (
                private.is_socially_active(p_viewer_id)
                and (owner_id is null or not private.is_blocked_between(owner_id, p_viewer_id))
              )
            )
        )
        or (
          private.is_moderator(p_viewer_id)
          and exists (
            select 1
            from public.post_media as media
            join public.reports as report
              on report.target_type = 'community_post'
             and report.target_id = media.post_id
            where media.bucket_id = p_bucket_id
              and media.object_path = p_object_path
              and media.status = 'ready'
              and exists (
                select 1
                from public.community_posts as reported_post
                where reported_post.id = media.post_id
                  and reported_post.status = 'active'
              )
          )
        )
      )
    )
    or (
      p_bucket_id = 'chat-media'
      and (
        exists (
          select 1
          from public.message_attachments as attachment
          join public.messages as message on message.id = attachment.message_id
          where attachment.bucket_id = p_bucket_id
            and attachment.object_path = p_object_path
            and attachment.removed_at is null
            and message.deleted_at is null
            and private.is_conversation_member(message.conversation_id, p_viewer_id, false)
        )
        or (
          private.is_moderator(p_viewer_id)
          and exists (
            select 1
            from public.message_attachments as attachment
            join public.reports as report
              on report.target_type = 'message'
             and report.target_id = attachment.message_id
            where attachment.bucket_id = p_bucket_id
              and attachment.object_path = p_object_path
              and attachment.removed_at is null
              and exists (
                select 1
                from public.messages as reported_message
                where reported_message.id = attachment.message_id
                  and reported_message.deleted_at is null
              )
          )
        )
      )
    )
    or (
      p_bucket_id = 'report-evidence'
      and private.is_moderator(p_viewer_id)
      and exists (
        select 1
        from public.report_evidence
        where bucket_id = p_bucket_id
          and object_path = p_object_path
      )
    )
  );
$$;

revoke all on function private.can_read_storage_object(text, text, uuid) from public, anon, authenticated;
grant execute on function private.can_read_storage_object(text, text, uuid) to authenticated, service_role;

create or replace function private.chat_object_has_forwards(p_bucket_id text, p_object_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.message_attachments
    where bucket_id = p_bucket_id
      and object_path = p_object_path
      and forwarded_from_attachment_id is not null
  );
$$;

create or replace function private.chat_object_is_sanctioned(p_bucket_id text, p_object_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.message_attachments
    where bucket_id = p_bucket_id
      and object_path = p_object_path
      and removed_at is not null
  );
$$;

create or replace function private.community_object_is_sanctioned(p_bucket_id text, p_object_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.post_media as media
    join public.community_posts as post on post.id = media.post_id
    where media.bucket_id = p_bucket_id
      and media.object_path = p_object_path
      and (media.status in ('deleting', 'failed') or post.status <> 'active')
  );
$$;

revoke all on function private.chat_object_has_forwards(text, text) from public, anon, authenticated;
revoke all on function private.chat_object_is_sanctioned(text, text) from public, anon, authenticated;
revoke all on function private.community_object_is_sanctioned(text, text) from public, anon, authenticated;
grant execute on function private.chat_object_has_forwards(text, text) to authenticated, service_role;
grant execute on function private.chat_object_is_sanctioned(text, text) to authenticated, service_role;
grant execute on function private.community_object_is_sanctioned(text, text) to authenticated, service_role;

drop policy if exists "ORHA authenticated users can upload owned media" on storage.objects;
create policy "ORHA authenticated users can upload owned media"
on storage.objects for insert to authenticated
with check (
  bucket_id in ('profile-media', 'community-media', 'chat-media')
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (
    (bucket_id = 'profile-media' and storage.extension(name) in ('jpg', 'jpeg', 'png', 'webp', 'avif'))
    or (
      bucket_id = 'community-media'
      and storage.extension(name) in ('jpg', 'jpeg', 'png', 'webp', 'avif', 'mp4')
      and (
        exists (
          select 1
          from public.post_media
          where owner_id = (select auth.uid())
            and bucket_id = 'community-media'
            and object_path = name
            and status = 'pending'
        )
        or (
          storage.extension(name) in ('jpg', 'jpeg', 'png', 'webp', 'avif')
          and (storage.foldername(name))[2] = 'community'
          and (storage.foldername(name))[4] in ('avatar', 'cover')
          and exists (
            select 1
            from public.communities
            where id::text = (storage.foldername(name))[3]
              and archived_at is null
              and private.can_manage_community(id, (select auth.uid()))
          )
        )
      )
    )
    or (bucket_id = 'chat-media' and storage.extension(name) in ('jpg', 'jpeg', 'png', 'webp', 'avif', 'webm', 'm4a', 'mp3', 'ogg', 'wav', 'pdf'))
  )
);

drop policy if exists "ORHA reporters can upload evidence" on storage.objects;
create policy "ORHA reporters can upload evidence"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'report-evidence'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and storage.extension(name) in ('jpg', 'jpeg', 'png', 'webp')
  and exists (
    select 1
    from public.reports
    where id::text = (storage.foldername(name))[2]
      and reporter_id = (select auth.uid())
      and status in ('open', 'in_review')
  )
);

drop policy if exists "ORHA users can read permitted private media" on storage.objects;
create policy "ORHA users can read permitted private media"
on storage.objects for select to authenticated
using (private.can_read_storage_object(bucket_id, name, (select auth.uid())));

drop policy if exists "ORHA owners can update their media" on storage.objects;
create policy "ORHA owners can update their media"
on storage.objects for update to authenticated
using (
  bucket_id in ('profile-media', 'community-media', 'chat-media')
  and owner_id = (select auth.uid())::text
  and (bucket_id <> 'chat-media' or not private.chat_object_is_sanctioned(bucket_id, name))
  and (bucket_id <> 'community-media' or not private.community_object_is_sanctioned(bucket_id, name))
)
with check (
  bucket_id in ('profile-media', 'community-media', 'chat-media')
  and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (bucket_id <> 'chat-media' or not private.chat_object_is_sanctioned(bucket_id, name))
  and (bucket_id <> 'community-media' or not private.community_object_is_sanctioned(bucket_id, name))
);

drop policy if exists "ORHA owners can delete their media" on storage.objects;
create policy "ORHA owners can delete their media"
on storage.objects for delete to authenticated
using (
  bucket_id in ('profile-media', 'community-media', 'chat-media')
  and owner_id = (select auth.uid())::text
  and (
    bucket_id <> 'chat-media'
    or not private.chat_object_has_forwards(bucket_id, name)
  )
);

-- Realtime Broadcast/Presence topics use `conversation:<uuid>` and inherit membership consent.
create or replace function private.realtime_conversation_id(p_topic text)
returns uuid
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_topic ~ '^conversation:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      then split_part(p_topic, ':', 2)::uuid
    else null
  end;
$$;

revoke all on function private.realtime_conversation_id(text) from public, anon;
grant execute on function private.realtime_conversation_id(text) to authenticated, service_role;

drop policy if exists "ORHA conversation members can receive realtime" on realtime.messages;
create policy "ORHA conversation members can receive realtime"
on realtime.messages for select to authenticated
using (
  private.is_conversation_member(
    private.realtime_conversation_id((select realtime.topic())),
    (select auth.uid()),
    false
  )
  and realtime.messages.extension in ('broadcast', 'presence')
);

drop policy if exists "ORHA conversation members can send realtime" on realtime.messages;
create policy "ORHA conversation members can send realtime"
on realtime.messages for insert to authenticated
with check (
  private.is_conversation_member(
    private.realtime_conversation_id((select realtime.topic())),
    (select auth.uid()),
    false
  )
  and realtime.messages.extension in ('broadcast', 'presence')
);

-- Launch uses Postgres Changes for the first-party client. Broadcast remains the scale-up path.
do $$
declare
  realtime_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach realtime_table in array array[
      'friendships',
      'blocks',
      'community_memberships',
      'community_posts',
      'post_comments',
      'post_reactions',
      'conversation_members',
      'conversation_requests',
      'messages',
      'message_reactions',
      'message_attachments',
      'message_receipts',
      'notifications'
    ]
    loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = realtime_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', realtime_table);
      end if;
    end loop;
  end if;
end
$$;

create or replace function private.notify_friendship_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform private.enqueue_notification(
      new.addressee_id,
      new.requester_id,
      'friendship_request',
      'friendship',
      new.id,
      '{}'::jsonb,
      'friendship_request:' || new.id::text,
      'social'
    );
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status and new.status in ('accepted', 'declined') then
    perform private.enqueue_notification(
      new.requester_id,
      new.addressee_id,
      case when new.status = 'accepted' then 'friendship_accepted' else 'friendship_declined' end,
      'friendship',
      new.id,
      '{}'::jsonb,
      'friendship_response:' || new.id::text,
      'social'
    );
  end if;
  return new;
end;
$$;

create trigger friendships_notify_participants
after insert or update of status on public.friendships
for each row execute function private.notify_friendship_change();

create or replace function private.notify_post_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_id uuid;
begin
  if new.parent_comment_id is not null then
    select author_id into recipient_id
    from public.post_comments
    where id = new.parent_comment_id;
  end if;

  if recipient_id is null or recipient_id = new.author_id then
    select author_id into recipient_id
    from public.community_posts
    where id = new.post_id;
  end if;

  perform private.enqueue_notification(
    recipient_id,
    new.author_id,
    case when new.parent_comment_id is null then 'post_commented' else 'comment_replied' end,
    'post_comment',
    new.id,
    jsonb_build_object('post_id', new.post_id),
    'post_comment:' || new.id::text,
    'community'
  );
  return new;
end;
$$;

create trigger post_comments_notify_author
after insert on public.post_comments
for each row execute function private.notify_post_comment();

create or replace function private.notify_post_reaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_id uuid;
  entity_type text;
  entity_id uuid;
begin
  if new.post_id is not null then
    select author_id into recipient_id from public.community_posts where id = new.post_id;
    entity_type := 'community_post';
    entity_id := new.post_id;
  else
    select author_id into recipient_id from public.post_comments where id = new.comment_id;
    entity_type := 'post_comment';
    entity_id := new.comment_id;
  end if;

  perform private.enqueue_notification(
    recipient_id,
    new.reactor_id,
    'content_reacted',
    entity_type,
    entity_id,
    jsonb_build_object('kind', new.kind::text),
    'reaction:' || new.id::text,
    'community'
  );
  return new;
end;
$$;

create trigger post_reactions_notify_author
after insert on public.post_reactions
for each row execute function private.notify_post_reaction();

revoke all on function private.notify_friendship_change() from public, anon, authenticated;
revoke all on function private.notify_post_comment() from public, anon, authenticated;
revoke all on function private.notify_post_reaction() from public, anon, authenticated;

comment on table public.blocks is 'One-way safety blocks. A block removes friendship and prevents new social or direct-conversation contact; it is not a follow model.';
comment on table public.conversation_requests is 'Consent gate for private contact. Accepting a conversation request never creates friendship.';
comment on table public.audit_logs is 'Append-only trusted audit trail. Browser roles have SELECT-only moderator access and no mutation grants.';
comment on table public.report_evidence is 'Private evidence metadata. Only the reporter can attach to an open report; only moderators can read evidence.';
comment on table public.account_lifecycle_requests is 'Trusted queue for export, immediate deactivation, and delayed deletion. Final execution belongs to an operations worker or Edge Function.';
comment on function public.search_visible_profiles(text, integer, integer) is 'Privacy-aware, block-aware server search with a fifty-row page cap and masked fields.';
comment on function public.remove_profile_media(uuid) is 'Removes database metadata and returns the private object path; callers remove the object through the Storage API.';
comment on function public.request_account_lifecycle(public.account_lifecycle_kind, text) is 'Destructive requests require explicit confirmation and a recently issued JWT. GoTrue reauthentication must still be performed by the client before calling.';

-- Fail the transaction if the security-critical launch postconditions are incomplete.
do $$
declare
  required_table text;
  realtime_table text;
  rls_enabled boolean;
begin
  foreach required_table in array array[
    'profile_moderation_state',
    'notification_preferences',
    'user_settings',
    'account_lifecycle_requests',
    'blocks',
    'profile_media',
    'communities',
    'community_memberships',
    'community_rules',
    'community_posts',
    'post_media',
    'post_comments',
    'post_reactions',
    'conversations',
    'conversation_members',
    'conversation_preferences',
    'conversation_requests',
    'messages',
    'message_reactions',
    'message_attachments',
    'message_receipts',
    'notifications',
    'reports',
    'report_evidence',
    'moderation_cases',
    'sanctions',
    'audit_logs'
  ]
  loop
    if to_regclass('public.' || required_table) is null then
      raise exception 'Launch table public.% is missing.', required_table using errcode = '55000';
    end if;

    select relrowsecurity into rls_enabled
    from pg_class
    where oid = to_regclass('public.' || required_table);
    if not coalesce(rls_enabled, false) then
      raise exception 'RLS is not enabled on public.%.', required_table using errcode = '55000';
    end if;

    if has_table_privilege('anon', 'public.' || required_table, 'SELECT') then
      raise exception 'Anonymous SELECT remains granted on public.%.', required_table using errcode = '55000';
    end if;
  end loop;

  if (
    select count(*)
    from storage.buckets
    where id in ('profile-media', 'community-media', 'chat-media', 'report-evidence')
      and public = false
  ) <> 4 then
    raise exception 'The four required private Storage buckets were not configured.' using errcode = '55000';
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname in (
        'ORHA conversation members can receive realtime',
        'ORHA conversation members can send realtime'
      )
  ) <> 2 then
    raise exception 'Private Realtime authorization policies are incomplete.' using errcode = '55000';
  end if;

  foreach realtime_table in array array[
    'friendships',
    'blocks',
    'community_memberships',
    'community_posts',
    'post_comments',
    'post_reactions',
    'conversation_members',
    'conversation_requests',
    'messages',
    'message_reactions',
    'message_attachments',
    'message_receipts',
    'notifications'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = realtime_table
    ) then
      raise exception 'Realtime publication is missing public.%.', realtime_table using errcode = '55000';
    end if;
  end loop;

  if to_regprocedure('public.search_visible_profiles(text,integer,integer)') is null
    or to_regprocedure('public.get_own_blocked_profile_by_username(text)') is null
    or to_regprocedure('public.get_community_discovery(uuid)') is null
    or to_regprocedure('public.update_community_details(uuid,text,text,text,public.community_visibility,text,text)') is null
    or to_regprocedure('public.archive_community(uuid)') is null
    or to_regprocedure('public.upsert_community_rule(uuid,text,text,smallint,uuid)') is null
    or to_regprocedure('public.delete_community_rule(uuid)') is null
    or to_regprocedure('public.set_community_member_role(uuid,uuid,public.community_role)') is null
    or to_regprocedure('public.ban_community_member(uuid,uuid,text)') is null
    or to_regprocedure('public.unban_community_member(uuid,uuid)') is null
    or to_regprocedure('public.remove_community_post(uuid)') is null
    or to_regprocedure('public.remove_post_comment(uuid)') is null
    or to_regprocedure('public.reserve_post_media(uuid,text,text,bigint,integer,integer,smallint)') is null
    or to_regprocedure('public.finalize_post_media(uuid)') is null
    or to_regprocedure('public.remove_post_media(uuid)') is null
    or to_regprocedure('public.list_post_media_cleanup(integer)') is null
    or to_regprocedure('public.complete_post_media_cleanup(uuid)') is null
    or to_regprocedure('public.send_message(uuid,public.message_kind,text,uuid,uuid)') is null
    or to_regprocedure('public.create_report(public.report_target_type,uuid,text,text)') is null
    or to_regprocedure('public.get_moderation_report_context(uuid)') is null
    or to_regprocedure('public.get_moderation_report_attachment(uuid,uuid)') is null
    or to_regprocedure('public.get_own_account_status()') is null
    or to_regprocedure('public.reconcile_expired_profile_restrictions(integer)') is null
    or to_regprocedure('public.list_message_attachment_cleanup(integer)') is null
    or to_regprocedure('public.complete_message_attachment_cleanup(uuid)') is null
    or to_regprocedure('public.request_account_lifecycle(public.account_lifecycle_kind,text)') is null then
    raise exception 'One or more security-critical launch RPCs are missing.' using errcode = '55000';
  end if;
end
$$;
