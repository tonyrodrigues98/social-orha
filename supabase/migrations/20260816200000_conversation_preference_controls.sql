-- Per-user conversation controls and authoritative cleared-history enforcement.
--
-- `cleared_before` is a non-destructive, per-member visibility watermark. It is
-- deliberately monotonic: clearing a conversation never makes older messages
-- visible again, while other members keep their own independent history.

do $$
declare
  required_table text;
begin
  foreach required_table in array array[
    'conversations',
    'conversation_members',
    'conversation_preferences',
    'messages',
    'message_reactions',
    'message_attachments',
    'message_receipts',
    'reports',
    'report_target_attachments'
  ]
  loop
    if to_regclass('public.' || required_table) is null then
      raise exception 'Conversation preference migration dependency public.% is missing.', required_table
        using errcode = '55000';
    end if;
  end loop;

  if to_regprocedure('private.account_access_enabled(uuid)') is null
    or to_regprocedure('private.is_socially_active(uuid)') is null
    or to_regprocedure('private.is_conversation_member(uuid,uuid,boolean)') is null
    or to_regprocedure('private.can_send_to_conversation(uuid,uuid)') is null
    or to_regprocedure('private.can_view_profile(uuid,uuid)') is null
    or to_regprocedure('private.is_blocked_between(uuid,uuid)') is null
    or to_regprocedure('private.is_active_community_member(uuid,uuid)') is null
    or to_regprocedure('private.can_view_community_post(uuid,uuid)') is null
    or to_regprocedure('private.persist_authoritative_message(uuid,uuid,public.message_kind,text,uuid,uuid,uuid)') is null
    or to_regprocedure('public.send_message(uuid,public.message_kind,text,uuid,uuid)') is null
    or to_regprocedure('public.send_validated_message_media(uuid,public.message_kind,text,uuid,uuid,uuid,text,text,bigint,numeric,jsonb,integer,integer)') is null
    or to_regprocedure('public.edit_message(uuid,text)') is null
    or to_regprocedure('public.delete_message(uuid)') is null
    or to_regprocedure('public.mark_message_read(uuid)') is null
    or to_regprocedure('public.mark_message_delivered(uuid)') is null
    or to_regprocedure('public.forward_message(uuid,uuid,uuid)') is null
    or to_regprocedure('public.create_report(public.report_target_type,uuid,text,text)') is null
    or to_regprocedure('private.capture_report_target_snapshot(uuid,public.report_target_type,uuid,uuid)') is null
    or to_regprocedure('private.can_read_storage_object(text,text,uuid)') is null then
    raise exception 'Conversation preference migration requires the launch and edge-worker contracts.'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_class
    where oid = 'public.messages'::regclass
      and relrowsecurity
  ) then
    raise exception 'RLS must already be enabled on public.messages.' using errcode = '55000';
  end if;
end
$$;

alter table public.conversation_preferences
  add column if not exists favorited_at timestamptz,
  add column if not exists cleared_before timestamptz;

create index if not exists conversation_preferences_profile_favorited_idx
on public.conversation_preferences (profile_id, favorited_at desc)
where favorited_at is not null;

-- Preference changes must invalidate message caches on every authenticated
-- device, not only in the browser session that called the RPC.
do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    raise exception 'The supabase_realtime publication is missing.' using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversation_preferences'
  ) then
    execute 'alter publication supabase_realtime add table public.conversation_preferences';
  end if;
end
$$;

create or replace function private.enforce_conversation_preference_cleared_before()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if old.cleared_before is not null
    and (
      new.cleared_before is null
      or new.cleared_before < old.cleared_before
    ) then
    raise exception 'The conversation clear watermark cannot move backwards.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists conversation_preferences_enforce_cleared_before
on public.conversation_preferences;
create trigger conversation_preferences_enforce_cleared_before
before update of cleared_before on public.conversation_preferences
for each row
execute function private.enforce_conversation_preference_cleared_before();

create or replace function private.can_view_message(
  p_message_id uuid,
  p_viewer_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_viewer_id is not null
    and private.account_access_enabled(p_viewer_id)
    and private.is_socially_active(p_viewer_id)
    and exists (
      select 1
      from public.messages as message
      join public.conversation_members as membership
        on membership.conversation_id = message.conversation_id
       and membership.profile_id = p_viewer_id
       and membership.status = 'active'
      left join public.conversation_preferences as preference
        on preference.conversation_id = membership.conversation_id
       and preference.profile_id = membership.profile_id
      where message.id = p_message_id
        and (
          preference.cleared_before is null
          or message.created_at > preference.cleared_before
        )
    );
$$;

create or replace function public.set_conversation_favorite(
  p_conversation_id uuid,
  p_favorited boolean
)
returns public.conversation_preferences
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  preference_record public.conversation_preferences;
begin
  if actor_id is null
    or not private.account_access_enabled(actor_id)
    or not private.is_socially_active(actor_id)
    or not private.is_conversation_member(p_conversation_id, actor_id, false) then
    raise exception 'Active conversation membership is required.' using errcode = '42501';
  end if;

  if p_favorited is null then
    raise exception 'A favorite state is required.' using errcode = '22023';
  end if;

  insert into public.conversation_preferences (
    conversation_id,
    profile_id,
    favorited_at
  )
  values (
    p_conversation_id,
    actor_id,
    case when p_favorited then clock_timestamp() else null end
  )
  on conflict (conversation_id, profile_id) do update
    set favorited_at = case when p_favorited then clock_timestamp() else null end,
        updated_at = clock_timestamp()
  returning * into preference_record;

  return preference_record;
end;
$$;

create or replace function public.clear_conversation_for_me(p_conversation_id uuid)
returns public.conversation_preferences
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  clear_at timestamptz := clock_timestamp();
  preference_record public.conversation_preferences;
begin
  if actor_id is null
    or not private.account_access_enabled(actor_id)
    or not private.is_socially_active(actor_id)
    or not private.is_conversation_member(p_conversation_id, actor_id, false) then
    raise exception 'Active conversation membership is required.' using errcode = '42501';
  end if;

  insert into public.conversation_preferences (
    conversation_id,
    profile_id,
    cleared_before
  )
  values (
    p_conversation_id,
    actor_id,
    clear_at
  )
  on conflict (conversation_id, profile_id) do update
    set cleared_before = case
          when public.conversation_preferences.cleared_before is null
            then excluded.cleared_before
          else greatest(
            public.conversation_preferences.cleared_before,
            excluded.cleared_before
          )
        end,
        updated_at = clock_timestamp()
  returning * into preference_record;

  return preference_record;
end;
$$;

-- All message table reads, including PostgREST search and embedded relations,
-- use the same server-side watermark predicate.
drop policy if exists "Active members can view messages" on public.messages;
create policy "Active members can view messages"
on public.messages for select to authenticated
using (private.can_view_message(id, (select auth.uid())));

drop policy if exists "Active members can view message reactions" on public.message_reactions;
create policy "Active members can view message reactions"
on public.message_reactions for select to authenticated
using (private.can_view_message(message_id, (select auth.uid())));

drop policy if exists "Active members can create message reactions" on public.message_reactions;
create policy "Active members can create message reactions"
on public.message_reactions for insert to authenticated
with check (
  reactor_id = (select auth.uid())
  and private.is_socially_active((select auth.uid()))
  and private.can_view_message(message_id, (select auth.uid()))
  and exists (
    select 1
    from public.messages as message
    where message.id = message_reactions.message_id
      and message.deleted_at is null
  )
);

drop policy if exists "Users can update their own message reactions" on public.message_reactions;
create policy "Users can update their own message reactions"
on public.message_reactions for update to authenticated
using (
  reactor_id = (select auth.uid())
  and private.can_view_message(message_id, (select auth.uid()))
)
with check (
  reactor_id = (select auth.uid())
  and private.is_socially_active((select auth.uid()))
  and private.can_view_message(message_id, (select auth.uid()))
  and exists (
    select 1
    from public.messages as message
    where message.id = message_reactions.message_id
      and message.deleted_at is null
  )
);

drop policy if exists "Users can remove their own message reactions" on public.message_reactions;
create policy "Users can remove their own message reactions"
on public.message_reactions for delete to authenticated
using (
  reactor_id = (select auth.uid())
  and private.can_view_message(message_id, (select auth.uid()))
);

drop policy if exists "Active members can view message attachments" on public.message_attachments;
create policy "Active members can view message attachments"
on public.message_attachments for select to authenticated
using (
  removed_at is null
  and private.can_view_message(message_id, (select auth.uid()))
  and exists (
    select 1
    from public.messages as message
    where message.id = message_attachments.message_id
      and message.deleted_at is null
  )
);

-- These direct attachment policies remain defense in depth even though the
-- edge-worker migration revokes browser INSERT/DELETE table privileges.
drop policy if exists "Message senders can add attachments" on public.message_attachments;
create policy "Message senders can add attachments"
on public.message_attachments for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and private.can_view_message(message_id, (select auth.uid()))
  and exists (
    select 1
    from public.messages as message
    where message.id = message_attachments.message_id
      and message.sender_id = (select auth.uid())
      and message.deleted_at is null
      and private.can_send_to_conversation(message.conversation_id, (select auth.uid()))
  )
);

drop policy if exists "Message senders can remove attachments" on public.message_attachments;
create policy "Message senders can remove attachments"
on public.message_attachments for delete to authenticated
using (
  owner_id = (select auth.uid())
  and removed_at is null
  and forwarded_from_attachment_id is null
  and private.can_view_message(message_id, (select auth.uid()))
  and exists (
    select 1
    from public.messages as message
    where message.id = message_attachments.message_id
      and message.sender_id = (select auth.uid())
      and message.deleted_at is null
  )
);

drop policy if exists "Conversation members can view receipts" on public.message_receipts;
create policy "Conversation members can view receipts"
on public.message_receipts for select to authenticated
using (private.can_view_message(message_id, (select auth.uid())));

-- The edge-worker contract owns the authoritative persistence primitive. It
-- serializes idempotent sends and is the only primitive allowed to persist
-- media after trusted byte validation. This forward definition preserves that
-- contract while applying the per-member visibility watermark.
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
  message_created_at timestamptz;
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
    select 1
    from public.messages as reply
    where reply.id = p_reply_to_message_id
      and reply.conversation_id = p_conversation_id
      and reply.deleted_at is null
      and private.can_view_message(reply.id, p_actor_id)
  ) then
    raise exception 'Reply target is unavailable.' using errcode = '22023';
  end if;

  if p_client_message_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(
      p_conversation_id::text || ':' || p_actor_id::text || ':' || p_client_message_id::text,
      0
    ));
    select * into message_record
    from public.messages as existing_message
    where existing_message.conversation_id = p_conversation_id
      and existing_message.sender_id = p_actor_id
      and existing_message.client_message_id = p_client_message_id
    for update;

    if found then
      if not private.can_view_message(message_record.id, p_actor_id) then
        raise exception 'The client message identifier belongs to cleared history.' using errcode = '42501';
      end if;
      if message_record.kind <> p_kind
        or message_record.body is distinct from normalized_body
        or message_record.reply_to_message_id is distinct from p_reply_to_message_id
        or message_record.forwarded_from_message_id is distinct from p_forwarded_from_message_id then
        raise exception 'The client message identifier is already bound to another payload.' using errcode = '23505';
      end if;
      return message_record;
    end if;
  end if;

  -- Use wall-clock time explicitly. PostgreSQL column defaults use the
  -- transaction-start timestamp, which could place a send performed after a
  -- clear in the same transaction at or before the new watermark.
  message_created_at := clock_timestamp();
  insert into public.messages (
    conversation_id,
    sender_id,
    client_message_id,
    kind,
    body,
    reply_to_message_id,
    forwarded_from_message_id,
    created_at
  )
  values (
    p_conversation_id,
    p_actor_id,
    p_client_message_id,
    p_kind,
    normalized_body,
    p_reply_to_message_id,
    p_forwarded_from_message_id,
    message_created_at
  ) returning * into message_record;

  update public.conversations
  set updated_at = clock_timestamp()
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
  join public.notification_preferences as preference
    on preference.profile_id = member.profile_id
  left join public.conversation_preferences as conversation_preference
    on conversation_preference.conversation_id = member.conversation_id
   and conversation_preference.profile_id = member.profile_id
  where member.conversation_id = p_conversation_id
    and member.status = 'active'
    and member.profile_id <> p_actor_id
    and preference.messages_enabled
    and coalesce(conversation_preference.notifications_enabled, true)
    and (
      conversation_preference.muted_until is null
      or conversation_preference.muted_until <= clock_timestamp()
    )
  on conflict do nothing;

  return message_record;
end;
$$;

-- Browser callers remain text-only. Atomic media persistence continues through
-- the service-role-only public.send_validated_message_media contract from 180.
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
  set body = btrim(p_body), edited_at = clock_timestamp()
  where id = p_message_id
    and sender_id = actor_id
    and kind = 'text'
    and deleted_at is null
    and created_at >= clock_timestamp() - interval '24 hours'
    and private.can_view_message(id, actor_id)
  returning * into message_record;

  if not found then
    raise exception 'Editable message not found.' using errcode = 'P0002';
  end if;
  return message_record;
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
  set body = null, deleted_at = clock_timestamp()
  where id = p_message_id
    and sender_id = actor_id
    and deleted_at is null
    and private.can_view_message(id, actor_id)
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
  target_conversation_id uuid;
  receipt public.message_receipts;
begin
  select message.conversation_id into target_conversation_id
  from public.messages as message
  where message.id = p_message_id
    and private.can_view_message(message.id, actor_id);

  if target_conversation_id is null
    or not private.is_conversation_member(target_conversation_id, actor_id, false) then
    raise exception 'Message is unavailable.' using errcode = '42501';
  end if;

  insert into public.message_receipts (message_id, profile_id, delivered_at, read_at)
  values (p_message_id, actor_id, clock_timestamp(), clock_timestamp())
  on conflict (message_id, profile_id) do update
    set delivered_at = coalesce(public.message_receipts.delivered_at, excluded.delivered_at),
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
  target_conversation_id uuid;
  receipt public.message_receipts;
begin
  select message.conversation_id into target_conversation_id
  from public.messages as message
  where message.id = p_message_id
    and private.can_view_message(message.id, actor_id);

  if target_conversation_id is null
    or not private.is_conversation_member(target_conversation_id, actor_id, false) then
    raise exception 'Message is unavailable.' using errcode = '42501';
  end if;

  insert into public.message_receipts (message_id, profile_id, delivered_at)
  values (p_message_id, actor_id, clock_timestamp())
  on conflict (message_id, profile_id) do update
    set delivered_at = coalesce(public.message_receipts.delivered_at, excluded.delivered_at)
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
  from public.messages as candidate
  where candidate.id = p_source_message_id
    and candidate.deleted_at is null
    and private.can_view_message(candidate.id, actor_id);

  if not found
    or source_message.kind = 'system'
    or not private.can_send_to_conversation(p_target_conversation_id, actor_id) then
    raise exception 'The source or target conversation is unavailable.' using errcode = '42501';
  end if;

  if source_message.kind <> 'text' and not exists (
    select 1
    from public.message_attachments as attachment
    where attachment.message_id = source_message.id
      and attachment.removed_at is null
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

-- Preserve the edge-worker migration's immutable, atomic report transaction.
-- Only its private target reader is strengthened so hidden targets cannot be
-- snapshotted through the SECURITY DEFINER boundary.
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
begin
  if p_actor_id is null or not private.is_socially_active(p_actor_id) then
    raise exception 'An active social account is required.' using errcode = '42501';
  end if;

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
      where profile.id = p_target_id
        and private.can_view_profile(profile.id, p_actor_id);
    when 'community' then
      select
        community.owner_id,
        left(concat_ws(E'\n', community.name, community.description), 12000),
        'community',
        community.created_at
      into owner_id, content_text, content_kind, content_created_at
      from public.communities as community
      where community.id = p_target_id
        and community.archived_at is null
        and (
          community.owner_id is null
          or not private.is_blocked_between(community.owner_id, p_actor_id)
        );
    when 'community_post' then
      select post.author_id, left(post.body, 12000), 'community_post', post.created_at
      into owner_id, content_text, content_kind, content_created_at
      from public.community_posts as post
      where post.id = p_target_id
        and post.status = 'active'
        and private.can_view_community_post(post.id, p_actor_id);
    when 'post_comment' then
      select comment.author_id, left(comment.body, 12000), 'post_comment', comment.created_at
      into owner_id, content_text, content_kind, content_created_at
      from public.post_comments as comment
      where comment.id = p_target_id
        and comment.status = 'active'
        and private.can_view_community_post(comment.post_id, p_actor_id);
    when 'message' then
      select
        message.sender_id,
        left(message.body, 12000),
        message.kind::text,
        message.created_at
      into owner_id, content_text, content_kind, content_created_at
      from public.messages as message
      where message.id = p_target_id
        and message.deleted_at is null
        and private.can_view_message(message.id, p_actor_id);
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

-- Storage authorization is derived from visible attachment rows. A path owner
-- keeps access only while the upload is genuinely orphaned (no domain row).
-- Retained target evidence is authorized exclusively by the audited,
-- retention-aware Storage policy installed by the edge-worker migration.
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
        from public.message_attachments as persisted_attachment
        where persisted_attachment.bucket_id = p_bucket_id
          and persisted_attachment.object_path = p_object_path
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
            and private.can_view_message(message.id, p_viewer_id)
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

-- New fields are RPC-only for browser users. Existing preference columns keep
-- their narrow column grants from the launch migration.
revoke update (favorited_at, cleared_before)
on public.conversation_preferences from public, anon, authenticated;

revoke all on function private.enforce_conversation_preference_cleared_before()
from public, anon, authenticated;
revoke all on function private.can_view_message(uuid, uuid)
from public, anon, authenticated;
grant execute on function private.can_view_message(uuid, uuid)
to authenticated, service_role;

revoke all on function public.set_conversation_favorite(uuid, boolean)
from public, anon, authenticated;
revoke all on function public.clear_conversation_for_me(uuid)
from public, anon, authenticated;
grant execute on function public.set_conversation_favorite(uuid, boolean)
to authenticated;
grant execute on function public.clear_conversation_for_me(uuid)
to authenticated;

revoke all on function public.send_message(uuid, public.message_kind, text, uuid, uuid)
from public, anon;
revoke all on function public.edit_message(uuid, text) from public, anon;
revoke all on function public.delete_message(uuid) from public, anon;
revoke all on function public.mark_message_read(uuid) from public, anon;
revoke all on function public.mark_message_delivered(uuid) from public, anon;
revoke all on function public.forward_message(uuid, uuid, uuid) from public, anon;
grant execute on function public.send_message(uuid, public.message_kind, text, uuid, uuid)
to authenticated;
grant execute on function public.edit_message(uuid, text) to authenticated;
grant execute on function public.delete_message(uuid) to authenticated;
grant execute on function public.mark_message_read(uuid) to authenticated;
grant execute on function public.mark_message_delivered(uuid) to authenticated;
grant execute on function public.forward_message(uuid, uuid, uuid) to authenticated;

revoke all on function private.persist_authoritative_message(
  uuid, uuid, public.message_kind, text, uuid, uuid, uuid
) from public, anon, authenticated, service_role;
revoke all on function private.capture_report_target_snapshot(
  uuid, public.report_target_type, uuid, uuid
) from public, anon, authenticated, service_role;

revoke all on function private.can_read_storage_object(text, text, uuid)
from public, anon, authenticated;
grant execute on function private.can_read_storage_object(text, text, uuid)
to authenticated, service_role;

comment on column public.conversation_preferences.favorited_at is
  'Per-member favorite timestamp; null means not favorited.';
comment on column public.conversation_preferences.cleared_before is
  'Monotonic per-member visibility watermark. Messages at or before this timestamp are hidden only from that member.';
comment on function private.can_view_message(uuid, uuid) is
  'Authoritative socially-active account, active-membership, and per-member clear-watermark message visibility predicate.';
comment on function public.set_conversation_favorite(uuid, boolean) is
  'Sets the authenticated active member favorite state without accepting a caller-supplied profile id.';
comment on function public.clear_conversation_for_me(uuid) is
  'Advances the authenticated active member cleared-history watermark monotonically.';

do $$
declare
  target_table text;
  function_definition text;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conversation_preferences'
      and column_name = 'favorited_at'
      and data_type = 'timestamp with time zone'
      and is_nullable = 'YES'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conversation_preferences'
      and column_name = 'cleared_before'
      and data_type = 'timestamp with time zone'
      and is_nullable = 'YES'
  ) then
    raise exception 'Conversation preference control columns are missing or invalid.' using errcode = '55000';
  end if;

  if to_regprocedure('private.can_view_message(uuid,uuid)') is null
    or to_regprocedure('public.set_conversation_favorite(uuid,boolean)') is null
    or to_regprocedure('public.clear_conversation_for_me(uuid)') is null
    or to_regprocedure(
      'private.capture_report_target_snapshot(uuid,public.report_target_type,uuid,uuid)'
    ) is null then
    raise exception 'Conversation preference control functions are missing.' using errcode = '55000';
  end if;

  select pg_get_functiondef('private.can_view_message(uuid,uuid)'::regprocedure)
  into function_definition;
  if position('is_socially_active' in function_definition) = 0
    or position('cleared_before' in function_definition) = 0
    or position('message.created_at > preference.cleared_before' in function_definition) = 0 then
    raise exception 'Authoritative message visibility is missing its active-account or clear-watermark guard.'
      using errcode = '55000';
  end if;

  foreach function_definition in array array[
    pg_get_functiondef('public.set_conversation_favorite(uuid,boolean)'::regprocedure),
    pg_get_functiondef('public.clear_conversation_for_me(uuid)'::regprocedure)
  ]
  loop
    if position('auth.uid()' in function_definition) = 0
      or position('is_socially_active' in function_definition) = 0
      or position('is_conversation_member' in function_definition) = 0 then
      raise exception 'A conversation preference RPC lacks server-side identity or active membership enforcement.'
        using errcode = '55000';
    end if;
  end loop;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.conversation_preferences'::regclass
      and tgname = 'conversation_preferences_enforce_cleared_before'
      and not tgisinternal
  ) then
    raise exception 'The monotonic clear-watermark trigger is missing.' using errcode = '55000';
  end if;

  if to_regclass('public.conversation_preferences_profile_favorited_idx') is null then
    raise exception 'The conversation favorite lookup index is missing.' using errcode = '55000';
  end if;

  select pg_get_functiondef(
    'private.enforce_conversation_preference_cleared_before()'::regprocedure
  ) into function_definition;
  if position('new.cleared_before < old.cleared_before' in function_definition) = 0
    or position('new.cleared_before is null' in function_definition) = 0 then
    raise exception 'The clear watermark can be reset or moved backwards.' using errcode = '55000';
  end if;

  select pg_get_functiondef('public.clear_conversation_for_me(uuid)'::regprocedure)
  into function_definition;
  if position('greatest' in function_definition) = 0
    or position('clock_timestamp' in function_definition) = 0 then
    raise exception 'The clear RPC does not advance its watermark monotonically.' using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversation_preferences'
  ) then
    raise exception 'Realtime publication is missing public.conversation_preferences.' using errcode = '55000';
  end if;

  foreach target_table in array array[
    'messages',
    'message_reactions',
    'message_attachments',
    'message_receipts',
    'report_target_attachments'
  ]
  loop
    if not exists (
      select 1
      from pg_class
      where oid = ('public.' || target_table)::regclass
        and relrowsecurity
    ) then
      raise exception 'RLS is not enabled on public.%.', target_table using errcode = '55000';
    end if;
  end loop;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and (
        (tablename = 'messages' and policyname = 'Active members can view messages' and cmd = 'SELECT')
        or (tablename = 'message_reactions' and policyname = 'Active members can view message reactions' and cmd = 'SELECT')
        or (tablename = 'message_attachments' and policyname = 'Active members can view message attachments' and cmd = 'SELECT')
        or (tablename = 'message_receipts' and policyname = 'Conversation members can view receipts' and cmd = 'SELECT')
      )
      and coalesce(qual, '') like '%can_view_message%'
  ) <> 4 then
    raise exception 'One or more message SELECT policies do not enforce the clear watermark.' using errcode = '55000';
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'message_reactions'
      and policyname in (
        'Active members can create message reactions',
        'Users can update their own message reactions',
        'Users can remove their own message reactions'
      )
      and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%can_view_message%'
  ) <> 3 then
    raise exception 'One or more reaction mutation policies bypass the clear watermark.' using errcode = '55000';
  end if;

  if has_column_privilege('authenticated', 'public.conversation_preferences', 'favorited_at', 'UPDATE')
    or has_column_privilege('authenticated', 'public.conversation_preferences', 'cleared_before', 'UPDATE') then
    raise exception 'Browser roles must not update preference control columns directly.' using errcode = '55000';
  end if;

  if not has_function_privilege(
      'authenticated',
      'public.set_conversation_favorite(uuid,boolean)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'authenticated',
      'public.clear_conversation_for_me(uuid)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.set_conversation_favorite(uuid,boolean)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.clear_conversation_for_me(uuid)',
      'EXECUTE'
    ) then
    raise exception 'Conversation preference RPC grants are invalid.' using errcode = '55000';
  end if;

  if not has_function_privilege(
      'authenticated',
      'public.send_message(uuid,public.message_kind,text,uuid,uuid)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'private.persist_authoritative_message(uuid,uuid,public.message_kind,text,uuid,uuid,uuid)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.send_validated_message_media(uuid,public.message_kind,text,uuid,uuid,uuid,text,text,bigint,numeric,jsonb,integer,integer)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.send_validated_message_media(uuid,public.message_kind,text,uuid,uuid,uuid,text,text,bigint,numeric,jsonb,integer,integer)',
      'EXECUTE'
    ) then
    raise exception 'Atomic text/media message persistence grants are invalid.' using errcode = '55000';
  end if;

  if has_function_privilege(
      'anon',
      'private.capture_report_target_snapshot(uuid,public.report_target_type,uuid,uuid)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'private.capture_report_target_snapshot(uuid,public.report_target_type,uuid,uuid)',
      'EXECUTE'
    )
    or has_function_privilege(
      'service_role',
      'private.capture_report_target_snapshot(uuid,public.report_target_type,uuid,uuid)',
      'EXECUTE'
    ) then
    raise exception 'Only canonical create_report may invoke report target capture.' using errcode = '55000';
  end if;

  select pg_get_functiondef('private.can_read_storage_object(text,text,uuid)'::regprocedure)
  into function_definition;
  if position('can_view_message' in function_definition) = 0
    or position('persisted_attachment' in function_definition) = 0
    or position('join public.reports' in function_definition) > 0 then
    raise exception 'Chat Storage authorization bypasses message visibility, orphan ownership, or retained-evidence expiry.'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'ORHA users can read permitted private media'
      and cmd = 'SELECT'
      and coalesce(qual, '') like '%can_read_storage_object%'
      and coalesce(qual, '') like '%report_target_attachment_is_retained%'
  ) then
    raise exception 'Storage policy no longer preserves the moderator retained-evidence exception.'
      using errcode = '55000';
  end if;

  foreach function_definition in array array[
    pg_get_functiondef('private.persist_authoritative_message(uuid,uuid,public.message_kind,text,uuid,uuid,uuid)'::regprocedure),
    pg_get_functiondef('public.edit_message(uuid,text)'::regprocedure),
    pg_get_functiondef('public.delete_message(uuid)'::regprocedure),
    pg_get_functiondef('public.mark_message_read(uuid)'::regprocedure),
    pg_get_functiondef('public.mark_message_delivered(uuid)'::regprocedure),
    pg_get_functiondef('public.forward_message(uuid,uuid,uuid)'::regprocedure),
    pg_get_functiondef(
      'private.capture_report_target_snapshot(uuid,public.report_target_type,uuid,uuid)'::regprocedure
    )
  ]
  loop
    if position('can_view_message' in function_definition) = 0 then
      raise exception 'A message API still bypasses the clear watermark.' using errcode = '55000';
    end if;
  end loop;

  select pg_get_functiondef(
    'public.send_message(uuid,public.message_kind,text,uuid,uuid)'::regprocedure
  ) into function_definition;
  if position('is distinct from ''text''' in function_definition) = 0
    or position('persist_authoritative_message' in function_definition) = 0 then
    raise exception 'Browser send_message no longer enforces the text-only atomic-media boundary.'
      using errcode = '55000';
  end if;

  select pg_get_functiondef(
    'private.persist_authoritative_message(uuid,uuid,public.message_kind,text,uuid,uuid,uuid)'::regprocedure
  ) into function_definition;
  if position('p_reply_to_message_id' in function_definition) = 0
    or position('can_view_message' in function_definition) = 0
    or position('message_created_at' in function_definition) = 0
    or position('clock_timestamp' in function_definition) = 0 then
    raise exception 'Authoritative persistence does not protect cleared replies, retries, or post-clear timestamps.'
      using errcode = '55000';
  end if;

  select pg_get_functiondef(
    'public.send_validated_message_media(uuid,public.message_kind,text,uuid,uuid,uuid,text,text,bigint,numeric,jsonb,integer,integer)'::regprocedure
  ) into function_definition;
  if position('persist_authoritative_message' in function_definition) = 0 then
    raise exception 'Validated media sends no longer use authoritative message persistence.'
      using errcode = '55000';
  end if;

  select pg_get_functiondef(
    'private.capture_report_target_snapshot(uuid,public.report_target_type,uuid,uuid)'::regprocedure
  ) into function_definition;
  if position('is_socially_active' in function_definition) = 0
    or position('can_view_profile' in function_definition) = 0
    or position('is_blocked_between' in function_definition) = 0
    or position('community.archived_at is null' in function_definition) = 0
    or position('can_view_community_post' in function_definition) = 0
    or position('can_view_message' in function_definition) = 0
    or position('capture_pending' in function_definition) = 0
    or position('target_snapshot' in function_definition) = 0
    or position('report_target_attachments' in function_definition) = 0
    or position('community.visibility' in function_definition) > 0
    or position('can_manage_community' in function_definition) > 0
    or position('is_active_community_member' in function_definition) > 0 then
    raise exception 'Report target capture can reveal a blocked, private, or cleared target or lose immutable evidence.'
      using errcode = '55000';
  end if;

  select pg_get_functiondef(
    'public.create_report(public.report_target_type,uuid,text,text)'::regprocedure
  ) into function_definition;
  if position('pg_advisory_xact_lock' in function_definition) = 0
    or position('capture_pending' in function_definition) = 0
    or position('capture_report_target_snapshot' in function_definition) = 0
    or position('moderation_cases' in function_definition) = 0
    or position('audit_logs' in function_definition) = 0 then
    raise exception 'Canonical report creation is no longer atomic with immutable target capture.'
      using errcode = '55000';
  end if;

  if not exists (
      select 1
      from pg_trigger
      where tgrelid = 'public.reports'::regclass
        and tgname = 'reports_target_snapshot_immutable'
        and not tgisinternal
    )
    or not exists (
      select 1
      from pg_trigger
      where tgrelid = 'public.report_target_attachments'::regclass
        and tgname = 'report_target_attachments_immutable'
        and not tgisinternal
    ) then
    raise exception 'Immutable report snapshot protections are missing.' using errcode = '55000';
  end if;
end
$$;
