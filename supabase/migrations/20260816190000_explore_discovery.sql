-- ORHA Explore: privacy-aware discovery for shared interests and public posts.
-- Forward-only migration. It depends on the frozen 20260816170000 social schema
-- and deliberately exposes no raw profile_details or privileged table access.

do $$
begin
  if to_regclass('public.profile_details') is null
    or to_regclass('public.profile_privacy') is null
    or to_regclass('public.community_posts') is null
    or to_regprocedure('private.is_socially_active(uuid)') is null
    or to_regprocedure('private.can_view_profile(uuid,uuid)') is null
    or to_regprocedure('private.can_view_community_post(uuid,uuid)') is null then
    raise exception 'Apply the ORHA social launch schema before Explore discovery.' using errcode = '55000';
  end if;
end
$$;

create or replace function public.search_discoverable_interests(
  p_search text default '',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  interest text,
  profile_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  viewer_id uuid := auth.uid();
  normalized_search text := lower(btrim(coalesce(p_search, '')));
begin
  if viewer_id is null or not private.is_socially_active(viewer_id) then
    raise exception 'An active profile is required for discovery.' using errcode = '42501';
  end if;
  if char_length(normalized_search) > 80
    or p_limit is null or p_limit < 1 or p_limit > 50
    or p_offset is null or p_offset < 0 or p_offset > 10000 then
    raise exception 'Invalid discovery pagination or search.' using errcode = '22023';
  end if;

  return query
  with authorized_interests as (
    select
      profile.id as profile_id,
      btrim(raw_interest.value) as display_interest,
      lower(btrim(raw_interest.value)) as interest_key
    from public.profiles as profile
    join public.profile_details as details on details.profile_id = profile.id
    cross join lateral unnest(coalesce(details.interests, '{}'::text[])) as raw_interest(value)
    where private.is_socially_active(profile.id)
      and private.can_view_profile(profile.id, viewer_id)
      and char_length(btrim(raw_interest.value)) between 1 and 80
  ),
  aggregated as (
    select
      min(authorized.display_interest) as display_interest,
      authorized.interest_key,
      count(distinct authorized.profile_id)::bigint as visible_profile_count
    from authorized_interests as authorized
    group by authorized.interest_key
    having count(distinct authorized.profile_id) >= 2
  )
  select
    aggregated.display_interest,
    aggregated.visible_profile_count
  from aggregated
  where normalized_search = ''
    or strpos(aggregated.interest_key, normalized_search) > 0
  order by
    aggregated.visible_profile_count desc,
    lower(aggregated.display_interest),
    aggregated.display_interest
  limit p_limit
  offset p_offset;
end;
$$;

create or replace function public.search_discoverable_posts(
  p_search text default '',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  post_id uuid,
  author_id uuid,
  author_name text,
  author_username text,
  author_avatar_path text,
  community_id uuid,
  community_name text,
  community_slug text,
  body text,
  created_at timestamptz,
  media_count bigint,
  comment_count bigint,
  reaction_count bigint,
  viewer_reaction public.reaction_kind
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  viewer_id uuid := auth.uid();
  normalized_search text := lower(btrim(coalesce(p_search, '')));
begin
  if viewer_id is null or not private.is_socially_active(viewer_id) then
    raise exception 'An active profile is required for discovery.' using errcode = '42501';
  end if;
  if char_length(normalized_search) > 80
    or p_limit is null or p_limit < 1 or p_limit > 50
    or p_offset is null or p_offset < 0 or p_offset > 10000 then
    raise exception 'Invalid discovery pagination or search.' using errcode = '22023';
  end if;

  return query
  select
    post.id,
    author.id,
    author.full_name,
    author.username::text,
    case
      when private.can_view_profile(author.id, viewer_id) then author.avatar_path
      else null
    end,
    community.id,
    community.name,
    community.slug::text,
    post.body,
    post.created_at,
    (
      select count(*)::bigint
      from public.post_media as media
      where media.post_id = post.id
        and media.status = 'ready'
    ),
    (
      select count(*)::bigint
      from public.post_comments as comment
      where comment.post_id = post.id
        and comment.status = 'active'
    ),
    (
      select count(*)::bigint
      from public.post_reactions as reaction
      where reaction.post_id = post.id
    ),
    (
      select reaction.kind
      from public.post_reactions as reaction
      where reaction.post_id = post.id
        and reaction.reactor_id = viewer_id
      limit 1
    )
  from public.community_posts as post
  join public.profiles as author on author.id = post.author_id
  left join public.communities as community on community.id = post.community_id
  where post.status = 'active'
    and post.visibility = 'public'
    and private.is_socially_active(author.id)
    and private.can_view_profile(author.id, viewer_id)
    and private.can_view_community_post(post.id, viewer_id)
    and (
      post.community_id is null
      or (
        community.visibility = 'public'
        and community.archived_at is null
      )
    )
    and (
      normalized_search = ''
      or strpos(lower(post.body), normalized_search) > 0
      or strpos(lower(coalesce(author.full_name, '')), normalized_search) > 0
      or strpos(lower(coalesce(author.username::text, '')), normalized_search) > 0
      or strpos(lower(coalesce(community.name, '')), normalized_search) > 0
    )
  order by
    case
      when normalized_search <> '' and lower(post.body) = normalized_search then 0
      when normalized_search <> '' and strpos(lower(post.body), normalized_search) = 1 then 1
      else 2
    end,
    post.created_at desc,
    post.id desc
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function public.search_discoverable_interests(text, integer, integer) from public, anon;
revoke all on function public.search_discoverable_posts(text, integer, integer) from public, anon;
grant execute on function public.search_discoverable_interests(text, integer, integer) to authenticated;
grant execute on function public.search_discoverable_posts(text, integer, integer) to authenticated;

comment on function public.search_discoverable_interests(text, integer, integer) is
  'Viewer-scoped interest discovery. Only privacy-visible active profiles contribute and groups smaller than two are omitted.';
comment on function public.search_discoverable_posts(text, integer, integer) is
  'Block-aware paginated search over active public posts from active authors and public communities.';

do $$
begin
  if to_regprocedure('public.search_discoverable_interests(text,integer,integer)') is null
    or to_regprocedure('public.search_discoverable_posts(text,integer,integer)') is null
    or not has_function_privilege(
      'authenticated',
      'public.search_discoverable_interests(text,integer,integer)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'authenticated',
      'public.search_discoverable_posts(text,integer,integer)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.search_discoverable_interests(text,integer,integer)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.search_discoverable_posts(text,integer,integer)',
      'EXECUTE'
    ) then
    raise exception 'Explore discovery postconditions are incomplete.' using errcode = '55000';
  end if;
end
$$;
