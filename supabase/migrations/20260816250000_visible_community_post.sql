-- Authoritative, by-id projection for a community publication deep link.
-- Missing, removed, blocked, private and cross-community records all collapse to zero rows.

do $$
begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.community_posts') is null
    or to_regclass('public.post_comments') is null
    or to_regclass('public.post_reactions') is null
    or to_regprocedure('private.account_access_enabled(uuid)') is null
    or to_regprocedure('private.is_socially_active(uuid)') is null
    or to_regprocedure('private.is_blocked_between(uuid,uuid)') is null
    or to_regprocedure('private.can_view_profile(uuid,uuid)') is null
    or to_regprocedure('private.can_view_community_post(uuid,uuid)') is null then
    raise exception 'Visible community post requires the hardened social profile and community contracts.'
      using errcode = '55000';
  end if;
end
$$;

create or replace function public.get_visible_community_post(
  p_post_id uuid
)
returns table (
  post_id uuid,
  community_id uuid,
  author_id uuid,
  body text,
  visibility public.content_visibility,
  status public.content_status,
  created_at timestamptz,
  updated_at timestamptz,
  comment_count bigint,
  reaction_count bigint,
  viewer_reaction public.reaction_kind,
  author_full_name text,
  author_username text,
  author_avatar_path text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  viewer_id uuid := auth.uid();
begin
  if viewer_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if not private.account_access_enabled(viewer_id)
    or not private.is_socially_active(viewer_id) then
    raise exception 'An active completed profile is required.' using errcode = '42501';
  end if;
  if p_post_id is null then
    return;
  end if;

  return query
  select
    post.id,
    post.community_id,
    case when author_access.visible then post.author_id else null end,
    post.body,
    post.visibility,
    post.status,
    post.created_at,
    post.updated_at,
    (
      select count(*)
      from public.post_comments as comment
      where comment.post_id = post.id
        and comment.status = 'active'
        and (
          comment.author_id is null
          or (
            private.is_socially_active(comment.author_id)
            and not private.is_blocked_between(comment.author_id, viewer_id)
          )
        )
    ) as comment_count,
    (
      select count(*)
      from public.post_reactions as reaction
      where reaction.post_id = post.id
        and private.is_socially_active(reaction.reactor_id)
        and not private.is_blocked_between(reaction.reactor_id, viewer_id)
    ) as reaction_count,
    (
      select reaction.kind
      from public.post_reactions as reaction
      where reaction.post_id = post.id
        and reaction.reactor_id = viewer_id
      limit 1
    ) as viewer_reaction,
    case when author_access.visible then author.full_name else null end,
    case when author_access.visible then author.username::text else null end,
    case when author_access.visible then author.avatar_path else null end
  from public.community_posts as post
  left join public.profiles as author on author.id = post.author_id
  cross join lateral (
    select post.author_id is not null
      and private.is_socially_active(post.author_id)
      and private.can_view_profile(post.author_id, viewer_id) as visible
  ) as author_access
  where post.id = p_post_id
    and post.community_id is not null
    and post.status = 'active'
    and (post.author_id is null or private.is_socially_active(post.author_id))
    and private.can_view_community_post(post.id, viewer_id)
  limit 1;
end;
$$;

revoke all on function public.get_visible_community_post(uuid) from public, anon, authenticated;
grant execute on function public.get_visible_community_post(uuid) to authenticated;

comment on function public.get_visible_community_post(uuid) is
  'Returns one privacy-filtered active community publication for a trusted UUID deep link.';

do $$
declare
  visible_post_function regprocedure := to_regprocedure(
    'public.get_visible_community_post(uuid)'
  );
  function_is_hardened boolean;
begin
  if visible_post_function is null then
    raise exception 'Visible community post function was not created.' using errcode = '55000';
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
  where candidate_function.oid = visible_post_function;

  if not coalesce(function_is_hardened, false)
    or has_function_privilege('public', visible_post_function, 'EXECUTE')
    or has_function_privilege('anon', visible_post_function, 'EXECUTE')
    or not has_function_privilege('authenticated', visible_post_function, 'EXECUTE') then
    raise exception 'Visible community post grants or execution context are not hardened.'
      using errcode = '55000';
  end if;
end
$$;
