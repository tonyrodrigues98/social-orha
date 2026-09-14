begin;

do $$
begin
  if to_regprocedure(
    'private.capture_report_target_snapshot(uuid,public.report_target_type,uuid,uuid)'
  ) is null then
    raise exception 'Report target snapshot function is missing.';
  end if;
end;
$$;

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
  owner_id uuid;
  content_text text;
  content_kind text;
  content_created_at timestamptz;
begin
  if p_actor_id is null or not private.is_socially_active(p_actor_id) then
    raise exception 'An active social account is required.' using errcode = '42501';
  end if;

  perform 1
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

revoke all on function private.capture_report_target_snapshot(
  uuid, public.report_target_type, uuid, uuid
) from public, anon, authenticated, service_role;

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'private.capture_report_target_snapshot(uuid,public.report_target_type,uuid,uuid)'::regprocedure
  ) into function_definition;

  if position('report_record' in function_definition) > 0
    or position('perform 1' in function_definition) = 0
    or position('for update' in function_definition) = 0 then
    raise exception 'Report target snapshot lint hardening was not installed.';
  end if;
end;
$$;

commit;

