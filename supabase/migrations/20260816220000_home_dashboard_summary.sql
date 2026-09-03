-- Bounded, privacy-preserving Home dashboard. One RPC replaces client-side fan-out and
-- intentionally omits message bodies, request opening messages, notification payloads,
-- birth dates and every other private profile field.

do $$
begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.profile_details') is null
    or to_regclass('public.profile_media') is null
    or to_regclass('public.friendships') is null
    or to_regclass('public.conversation_requests') is null
    or to_regclass('public.conversations') is null
    or to_regclass('public.conversation_members') is null
    or to_regclass('public.conversation_preferences') is null
    or to_regclass('public.messages') is null
    or to_regclass('public.message_receipts') is null
    or to_regclass('public.notifications') is null
    or to_regclass('public.communities') is null
    or to_regclass('public.community_memberships') is null
    or to_regclass('public.community_posts') is null
    or to_regprocedure('private.account_access_enabled(uuid)') is null
    or to_regprocedure('private.effective_profile_account_status(uuid)') is null
    or to_regprocedure('private.is_socially_active(uuid)') is null
    or to_regprocedure('private.is_blocked_between(uuid,uuid)') is null
    or to_regprocedure('private.can_view_profile(uuid,uuid)') is null
    or to_regprocedure('private.can_view_community_post(uuid,uuid)') is null
    or to_regprocedure('private.can_view_message(uuid,uuid)') is null then
    raise exception 'Home dashboard summary requires the profile, social, messaging, notification and conversation-preference contracts.'
      using errcode = '55000';
  end if;
end
$$;

create or replace function public.get_home_dashboard_summary(
  p_recent_limit integer default 5
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  viewer_id uuid := auth.uid();
  item_limit integer := least(greatest(coalesce(p_recent_limit, 5), 1), 10);
  summary jsonb;
begin
  if viewer_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if not private.account_access_enabled(viewer_id)
    or private.effective_profile_account_status(viewer_id) <> 'active'
    or not private.is_socially_active(viewer_id) then
    raise exception 'An active completed profile is required.' using errcode = '42501';
  end if;

  with
  visible_friend_requests as materialized (
    select
      friendship.id,
      friendship.created_at,
      requester.id as requester_id,
      requester.full_name as requester_name,
      requester.username::text as requester_username
    from public.friendships as friendship
    join public.profiles as requester on requester.id = friendship.requester_id
    where friendship.addressee_id = viewer_id
      and friendship.status = 'pending'
      and private.is_socially_active(requester.id)
      and not private.is_blocked_between(requester.id, viewer_id)
      and private.can_view_profile(requester.id, viewer_id)
  ),
  friend_request_items as (
    select *
    from visible_friend_requests
    order by created_at desc, id desc
    limit item_limit
  ),
  visible_conversation_requests as materialized (
    select
      request.id,
      request.created_at,
      requester.id as requester_id,
      requester.full_name as requester_name,
      requester.username::text as requester_username
    from public.conversation_requests as request
    join public.profiles as requester on requester.id = request.requester_id
    where request.recipient_id = viewer_id
      and request.status = 'pending'
      and private.is_socially_active(requester.id)
      and not private.is_blocked_between(requester.id, viewer_id)
      and private.can_view_profile(requester.id, viewer_id)
  ),
  conversation_request_items as (
    select *
    from visible_conversation_requests
    order by created_at desc, id desc
    limit item_limit
  ),
  conversation_candidates as materialized (
    select
      conversation.id,
      conversation.kind,
      conversation.title,
      conversation.direct_user_low,
      conversation.direct_user_high,
      conversation.created_at,
      conversation.updated_at,
      membership.joined_at,
      case
        when conversation.direct_user_low = viewer_id then conversation.direct_user_high
        when conversation.direct_user_high = viewer_id then conversation.direct_user_low
        else null
      end as counterpart_id
    from public.conversations as conversation
    join public.conversation_members as membership
      on membership.conversation_id = conversation.id
     and membership.profile_id = viewer_id
     and membership.status = 'active'
    left join public.conversation_preferences as preference
      on preference.conversation_id = conversation.id
     and preference.profile_id = viewer_id
    where preference.archived_at is null
      and (
        conversation.kind <> 'direct'
        or not private.is_blocked_between(
          conversation.direct_user_low,
          conversation.direct_user_high
        )
      )
  ),
  recent_conversation_rows as materialized (
    select
      candidate.id,
      candidate.kind,
      case
        when candidate.kind = 'group' then coalesce(nullif(btrim(candidate.title), ''), 'Grupo')
        when counterpart.id is not null
          and private.is_socially_active(counterpart.id)
          and private.can_view_profile(counterpart.id, viewer_id)
          then coalesce(
            nullif(btrim(counterpart.full_name), ''),
            nullif(btrim(counterpart.username::text), ''),
            'Conversa'
          )
        else 'Conversa'
      end as display_title,
      coalesce(last_message.created_at, candidate.joined_at, candidate.created_at) as last_activity_at,
      coalesce(unread.unread_count, 0)::integer as unread_count
    from conversation_candidates as candidate
    left join public.profiles as counterpart on counterpart.id = candidate.counterpart_id
    left join lateral (
      select message.created_at
      from public.messages as message
      where message.conversation_id = candidate.id
        and message.deleted_at is null
        and private.can_view_message(message.id, viewer_id)
      order by message.created_at desc, message.id desc
      limit 1
    ) as last_message on true
    left join lateral (
      select count(*) as unread_count
      from public.message_receipts as receipt
      join public.messages as message on message.id = receipt.message_id
      where receipt.profile_id = viewer_id
        and receipt.read_at is null
        and message.conversation_id = candidate.id
        and message.deleted_at is null
        and private.can_view_message(message.id, viewer_id)
    ) as unread on true
    order by coalesce(last_message.created_at, candidate.joined_at, candidate.created_at) desc,
      candidate.id desc
    limit item_limit
  ),
  visible_notifications as materialized (
    select
      notification.id,
      notification.type,
      notification.entity_type,
      notification.entity_id,
      notification.created_at,
      notification.read_at,
      notification.actor_id,
      actor.full_name as actor_name,
      actor.username::text as actor_username,
      (
        actor.id is not null
        and private.is_socially_active(actor.id)
        and private.can_view_profile(actor.id, viewer_id)
      ) as actor_visible
    from public.notifications as notification
    left join public.profiles as actor on actor.id = notification.actor_id
    where notification.recipient_id = viewer_id
      and (
        notification.type in (
          'security_alert',
          'account_warning',
          'moderation_action',
          'community_membership_banned',
          'community_membership_unbanned',
          'community_role_changed',
          'community_post_removed'
        )
        or notification.actor_id is null
        or (
          private.is_socially_active(notification.actor_id)
          and not private.is_blocked_between(notification.actor_id, viewer_id)
        )
      )
  ),
  notification_items as (
    select *
    from visible_notifications
    order by created_at desc, id desc
    limit item_limit
  ),
  community_rows as materialized (
    select
      community.id,
      community.name,
      community.category,
      latest_post.created_at as last_activity_at,
      membership.joined_at
    from public.community_memberships as membership
    join public.communities as community on community.id = membership.community_id
    left join lateral (
      select post.created_at
      from public.community_posts as post
      where post.community_id = community.id
        and post.status = 'active'
        and (post.author_id is null or private.is_socially_active(post.author_id))
        and private.can_view_community_post(post.id, viewer_id)
      order by post.created_at desc, post.id desc
      limit 1
    ) as latest_post on true
    where membership.profile_id = viewer_id
      and membership.status = 'active'
      and community.archived_at is null
      and (
        community.owner_id is null
        or not private.is_blocked_between(community.owner_id, viewer_id)
      )
    order by coalesce(latest_post.created_at, membership.joined_at, community.updated_at) desc,
      community.id desc
    limit item_limit
  ),
  community_activity_rows as materialized (
    select
      post.id as post_id,
      community.id as community_id,
      community.name as community_name,
      case
        when author.id is not null
          and private.is_socially_active(author.id)
          and private.can_view_profile(author.id, viewer_id)
          then author.full_name
        else null
      end as author_name,
      post.created_at
    from public.community_memberships as membership
    join public.communities as community on community.id = membership.community_id
    join public.community_posts as post on post.community_id = community.id
    left join public.profiles as author on author.id = post.author_id
    where membership.profile_id = viewer_id
      and membership.status = 'active'
      and community.archived_at is null
      and post.status = 'active'
      and (post.author_id is null or private.is_socially_active(post.author_id))
      and private.can_view_community_post(post.id, viewer_id)
      and (
        community.owner_id is null
        or not private.is_blocked_between(community.owner_id, viewer_id)
      )
    order by post.created_at desc, post.id desc
    limit item_limit
  ),
  completion_signals as materialized (
    select signal.position, signal.key, signal.complete
    from public.profiles as profile
    left join public.profile_details as details on details.profile_id = profile.id
    cross join lateral (
      values
        (1, 'fullName', nullif(btrim(profile.full_name), '') is not null),
        (2, 'username', nullif(btrim(profile.username::text), '') is not null),
        (3, 'birthDate', profile.birth_date is not null),
        (4, 'state', nullif(btrim(profile.state_code), '') is not null),
        (5, 'city', nullif(btrim(profile.city), '') is not null),
        (6, 'bio', nullif(btrim(profile.bio), '') is not null),
        (7, 'personality', coalesce(cardinality(details.personality), 0) > 0),
        (8, 'favoriteSeason', nullif(btrim(details.favorite_season), '') is not null),
        (9, 'socialEnergy', nullif(btrim(details.social_energy), '') is not null),
        (10, 'weekendPreferences', coalesce(cardinality(details.weekend_preferences), 0) > 0),
        (11, 'interests', coalesce(cardinality(details.interests), 0) > 0),
        (12, 'hobbies', coalesce(cardinality(details.hobbies), 0) > 0),
        (13, 'visitedPlaces', coalesce(cardinality(details.visited_places), 0) > 0),
        (14, 'desiredPlaces', coalesce(cardinality(details.desired_places), 0) > 0),
        (
          15,
          'favorites',
          jsonb_array_length(case when jsonb_typeof(details.favorite_movies) = 'array' then details.favorite_movies else '[]'::jsonb end) > 0
          or jsonb_array_length(case when jsonb_typeof(details.favorite_series) = 'array' then details.favorite_series else '[]'::jsonb end) > 0
          or jsonb_array_length(case when jsonb_typeof(details.favorite_songs) = 'array' then details.favorite_songs else '[]'::jsonb end) > 0
          or jsonb_array_length(case when jsonb_typeof(details.favorite_artists) = 'array' then details.favorite_artists else '[]'::jsonb end) > 0
          or jsonb_array_length(case when jsonb_typeof(details.favorite_books) = 'array' then details.favorite_books else '[]'::jsonb end) > 0
          or jsonb_array_length(case when jsonb_typeof(details.favorite_games) = 'array' then details.favorite_games else '[]'::jsonb end) > 0
        ),
        (
          16,
          'avatar',
          exists (
            select 1 from public.profile_media
            where profile_id = profile.id and purpose = 'avatar' and status = 'ready'
          )
        ),
        (
          17,
          'cover',
          exists (
            select 1 from public.profile_media
            where profile_id = profile.id and purpose = 'cover' and status = 'ready'
          )
        ),
        (
          18,
          'gallery',
          exists (
            select 1 from public.profile_media
            where profile_id = profile.id and purpose = 'gallery' and status = 'ready'
          )
        )
    ) as signal(position, key, complete)
    where profile.id = viewer_id
  ),
  completion_stats as (
    select
      count(*) filter (where complete)::integer as completed_signals,
      count(*)::integer as total_signals,
      coalesce(
        jsonb_agg(to_jsonb(key) order by position) filter (where not complete),
        '[]'::jsonb
      ) as missing
    from completion_signals
  )
  select jsonb_build_object(
    'pendingFriendRequests', jsonb_build_object(
      'count', (select count(*)::integer from visible_friend_requests),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', item.id,
          'createdAt', item.created_at,
          'requester', jsonb_build_object(
            'id', item.requester_id,
            'fullName', item.requester_name,
            'username', item.requester_username
          )
        ) order by item.created_at desc, item.id desc)
        from friend_request_items as item
      ), '[]'::jsonb)
    ),
    'pendingConversationRequests', jsonb_build_object(
      'count', (select count(*)::integer from visible_conversation_requests),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', item.id,
          'createdAt', item.created_at,
          'requester', jsonb_build_object(
            'id', item.requester_id,
            'fullName', item.requester_name,
            'username', item.requester_username
          )
        ) order by item.created_at desc, item.id desc)
        from conversation_request_items as item
      ), '[]'::jsonb)
    ),
    'recentConversations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id,
        'kind', item.kind::text,
        'title', item.display_title,
        'unreadCount', item.unread_count,
        'lastActivityAt', item.last_activity_at
      ) order by item.last_activity_at desc, item.id desc)
      from recent_conversation_rows as item
    ), '[]'::jsonb),
    'notifications', jsonb_build_object(
      'unreadCount', (
        select count(*)::integer from visible_notifications where read_at is null
      ),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', item.id,
          'type', item.type,
          'entityType', item.entity_type,
          'entityId', item.entity_id,
          'createdAt', item.created_at,
          'readAt', item.read_at,
          'actor', case when item.actor_visible then jsonb_build_object(
            'id', item.actor_id,
            'fullName', item.actor_name,
            'username', item.actor_username
          ) else null end
        ) order by item.created_at desc, item.id desc)
        from notification_items as item
      ), '[]'::jsonb)
    ),
    'communities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.id,
        'name', item.name,
        'category', item.category,
        'lastActivityAt', item.last_activity_at
      ) order by coalesce(item.last_activity_at, item.joined_at) desc nulls last, item.id desc)
      from community_rows as item
    ), '[]'::jsonb),
    'communityActivity', coalesce((
      select jsonb_agg(jsonb_build_object(
        'postId', item.post_id,
        'communityId', item.community_id,
        'communityName', item.community_name,
        'authorName', item.author_name,
        'createdAt', item.created_at
      ) order by item.created_at desc, item.post_id desc)
      from community_activity_rows as item
    ), '[]'::jsonb),
    'profileCompletion', (
      select jsonb_build_object(
        'percentage', case
          when total_signals = 0 then 0
          else round(completed_signals * 100.0 / total_signals)::integer
        end,
        'completedSignals', completed_signals,
        'totalSignals', total_signals,
        'missing', missing
      )
      from completion_stats
    )
  ) into summary;

  if summary is null or pg_column_size(summary) > 131072 then
    raise exception 'Home dashboard summary exceeded its safe payload bound.' using errcode = '54000';
  end if;
  return summary;
end;
$$;

revoke all on function public.get_home_dashboard_summary(integer) from public, anon, authenticated;
grant execute on function public.get_home_dashboard_summary(integer) to authenticated;

comment on function public.get_home_dashboard_summary(integer) is
  'Returns one bounded, privacy-filtered Home summary for auth.uid without message bodies or private profile values.';

do $$
declare
  dashboard_function regprocedure := to_regprocedure(
    'public.get_home_dashboard_summary(integer)'
  );
  function_is_hardened boolean;
begin
  if dashboard_function is null then
    raise exception 'Home dashboard summary function was not created.' using errcode = '55000';
  end if;

  select candidate_function.prosecdef
    and candidate_function.provolatile = 's'
    and exists (
      select 1
      from unnest(coalesce(candidate_function.proconfig, array[]::text[])) as setting
      where setting in ('search_path=', 'search_path=""')
    )
  into function_is_hardened
  from pg_proc as candidate_function
  where candidate_function.oid = dashboard_function;

  if not coalesce(function_is_hardened, false)
    or has_function_privilege('anon', dashboard_function, 'EXECUTE')
    or not has_function_privilege('authenticated', dashboard_function, 'EXECUTE') then
    raise exception 'Home dashboard summary grants or execution context are not hardened.'
      using errcode = '55000';
  end if;
end
$$;
