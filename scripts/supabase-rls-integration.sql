-- ORHA transactional RLS integration gate.
-- Run only after migrations through 20260816210000 are applied:
--   npx supabase db query --linked --file scripts/supabase-rls-integration.sql --output-format json
--
-- The fixed test identities are created and exercised inside one transaction. The final
-- ROLLBACK is intentional: a successful run leaves Auth, public, Storage, and audit data unchanged.

begin;
set local statement_timeout = '60s';
set local lock_timeout = '5s';

select pg_advisory_xact_lock(hashtextextended('orha:supabase-rls-integration:v1', 0));

create function pg_temp.assert_true(condition boolean, failure_message text)
returns void
language plpgsql
as $$
begin
  if condition is distinct from true then
    raise exception 'RLS integration assertion failed: %', failure_message using errcode = 'P0001';
  end if;
end;
$$;

create function pg_temp.assert_rejected(statement text, failure_message text)
returns void
language plpgsql
as $$
declare
  was_rejected boolean := false;
begin
  begin
    execute statement;
  exception
    when others then
      was_rejected := true;
  end;

  if not was_rejected then
    raise exception 'RLS integration assertion failed: %', failure_message using errcode = 'P0001';
  end if;
end;
$$;

-- Stable, non-production UUIDs make failures easy to reproduce while the transaction lock
-- prevents two copies of this gate from colliding.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  actor.id,
  'authenticated',
  'authenticated',
  actor.email,
  '',
  timezone('utc', now()),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  timezone('utc', now()),
  timezone('utc', now())
from (values
  ('11111111-1111-4111-8111-000000000001'::uuid, 'rls-owner@orha.invalid'),
  ('11111111-1111-4111-8111-000000000002'::uuid, 'rls-other@orha.invalid'),
  ('11111111-1111-4111-8111-000000000003'::uuid, 'rls-friend@orha.invalid'),
  ('11111111-1111-4111-8111-000000000004'::uuid, 'rls-blocked@orha.invalid'),
  ('11111111-1111-4111-8111-000000000005'::uuid, 'rls-community-moderator@orha.invalid'),
  ('11111111-1111-4111-8111-000000000006'::uuid, 'rls-global-moderator@orha.invalid'),
  ('11111111-1111-4111-8111-000000000007'::uuid, 'rls-admin@orha.invalid'),
  ('11111111-1111-4111-8111-000000000008'::uuid, 'rls-super-admin@orha.invalid'),
  ('11111111-1111-4111-8111-000000000009'::uuid, 'rls-support@orha.invalid')
) as actor(id, email);

update public.profiles as profile
set full_name = actor.full_name,
    username = actor.username::extensions.citext,
    birth_date = date '1990-01-01',
    state_code = 'SP',
    city = 'Sao Paulo',
    bio = 'Perfil sintetico do gate RLS',
    onboarding_step = 6,
    onboarding_completed_at = timezone('utc', now())
from (values
  ('11111111-1111-4111-8111-000000000001'::uuid, 'RLS Owner', 'rls.owner'),
  ('11111111-1111-4111-8111-000000000002'::uuid, 'RLS Other', 'rls.other'),
  ('11111111-1111-4111-8111-000000000003'::uuid, 'RLS Friend', 'rls.friend'),
  ('11111111-1111-4111-8111-000000000004'::uuid, 'RLS Blocked', 'rls.blocked'),
  ('11111111-1111-4111-8111-000000000005'::uuid, 'RLS Community Moderator', 'rls.community.mod'),
  ('11111111-1111-4111-8111-000000000006'::uuid, 'RLS Global Moderator', 'rls.global.mod'),
  ('11111111-1111-4111-8111-000000000007'::uuid, 'RLS Admin', 'rls.admin'),
  ('11111111-1111-4111-8111-000000000008'::uuid, 'RLS Super Admin', 'rls.super.admin'),
  ('11111111-1111-4111-8111-000000000009'::uuid, 'RLS Support', 'rls.support')
) as actor(id, full_name, username)
where profile.id = actor.id;

update public.user_roles
set role = case user_id
  when '11111111-1111-4111-8111-000000000006'::uuid then 'moderator'::public.app_role
  when '11111111-1111-4111-8111-000000000007'::uuid then 'admin'::public.app_role
  when '11111111-1111-4111-8111-000000000008'::uuid then 'super_admin'::public.app_role
  when '11111111-1111-4111-8111-000000000009'::uuid then 'support'::public.app_role
  else role
end
where user_id in (
  '11111111-1111-4111-8111-000000000006'::uuid,
  '11111111-1111-4111-8111-000000000007'::uuid,
  '11111111-1111-4111-8111-000000000008'::uuid,
  '11111111-1111-4111-8111-000000000009'::uuid
);

update public.profile_privacy
set profile_visibility = 'friends',
    age_visibility = 'friends',
    location_visibility = 'friends',
    favorites_visibility = 'friends',
    gallery_visibility = 'friends'
where profile_id = '11111111-1111-4111-8111-000000000001'::uuid;

insert into public.profile_details (profile_id, interests, favorite_movies)
values
(
  '11111111-1111-4111-8111-000000000001'::uuid,
  array['comunidade', 'cinema'],
  '[{"id":"rls-movie","title":"RLS Movie"}]'::jsonb
),
(
  '11111111-1111-4111-8111-000000000003'::uuid,
  array['cinema', 'livros'],
  '[]'::jsonb
)
on conflict (profile_id) do update
set interests = excluded.interests,
    favorite_movies = excluded.favorite_movies;

insert into public.friendships (id, requester_id, addressee_id, status, accepted_at)
values (
  '21111111-1111-4111-8111-000000000001'::uuid,
  '11111111-1111-4111-8111-000000000001'::uuid,
  '11111111-1111-4111-8111-000000000003'::uuid,
  'accepted',
  timezone('utc', now())
);

insert into public.blocks (id, blocker_id, blocked_id, reason)
values (
  '21111111-1111-4111-8111-000000000002'::uuid,
  '11111111-1111-4111-8111-000000000001'::uuid,
  '11111111-1111-4111-8111-000000000004'::uuid,
  'RLS integration gate'
);

insert into public.communities (id, slug, name, description, owner_id, visibility)
values
  (
    '22222222-2222-4222-8222-000000000001'::uuid,
    'rls-private-community',
    'RLS Private Community',
    'Private community for integration assertions',
    '11111111-1111-4111-8111-000000000001'::uuid,
    'private'
  ),
  (
    '22222222-2222-4222-8222-000000000002'::uuid,
    'rls-public-community',
    'RLS Public Community',
    'Public community for report assertions',
    '11111111-1111-4111-8111-000000000001'::uuid,
    'public'
  ),
  (
    '22222222-2222-4222-8222-000000000003'::uuid,
    'rls-archive-community',
    'RLS Archive Community',
    'Disposable community for archive assertions',
    '11111111-1111-4111-8111-000000000001'::uuid,
    'private'
  );

insert into public.community_memberships (community_id, profile_id, role, status, joined_at)
values
  (
    '22222222-2222-4222-8222-000000000001'::uuid,
    '11111111-1111-4111-8111-000000000001'::uuid,
    'owner',
    'active',
    timezone('utc', now())
  ),
  (
    '22222222-2222-4222-8222-000000000001'::uuid,
    '11111111-1111-4111-8111-000000000003'::uuid,
    'member',
    'active',
    timezone('utc', now())
  ),
  (
    '22222222-2222-4222-8222-000000000001'::uuid,
    '11111111-1111-4111-8111-000000000005'::uuid,
    'moderator',
    'active',
    timezone('utc', now())
  ),
  (
    '22222222-2222-4222-8222-000000000001'::uuid,
    '11111111-1111-4111-8111-000000000009'::uuid,
    'member',
    'left',
    null
  ),
  (
    '22222222-2222-4222-8222-000000000003'::uuid,
    '11111111-1111-4111-8111-000000000001'::uuid,
    'owner',
    'active',
    timezone('utc', now())
  );

insert into public.community_posts (id, author_id, community_id, body, visibility)
values
  (
    '33333333-3333-4333-8333-000000000001'::uuid,
    '11111111-1111-4111-8111-000000000001'::uuid,
    '22222222-2222-4222-8222-000000000001'::uuid,
    'Private member-only RLS post',
    'community'
  ),
  (
    '33333333-3333-4333-8333-000000000002'::uuid,
    '11111111-1111-4111-8111-000000000001'::uuid,
    '22222222-2222-4222-8222-000000000002'::uuid,
    'Public reportable RLS post',
    'public'
  );

insert into public.post_comments (id, post_id, author_id, body)
values (
  '37777777-7777-4777-8777-000000000001'::uuid,
  '33333333-3333-4333-8333-000000000001'::uuid,
  '11111111-1111-4111-8111-000000000003'::uuid,
  'Synthetic removable community comment'
);

insert into public.conversations (
  id,
  kind,
  created_by,
  direct_user_low,
  direct_user_high
)
values (
  '44444444-4444-4444-8444-000000000001'::uuid,
  'direct',
  '11111111-1111-4111-8111-000000000001'::uuid,
  '11111111-1111-4111-8111-000000000001'::uuid,
  '11111111-1111-4111-8111-000000000003'::uuid
);

insert into public.conversation_members (conversation_id, profile_id, role, status, joined_at)
values
  (
    '44444444-4444-4444-8444-000000000001'::uuid,
    '11111111-1111-4111-8111-000000000001'::uuid,
    'owner',
    'active',
    timezone('utc', now())
  ),
  (
    '44444444-4444-4444-8444-000000000001'::uuid,
    '11111111-1111-4111-8111-000000000003'::uuid,
    'member',
    'active',
    timezone('utc', now())
  );

insert into public.conversation_preferences (conversation_id, profile_id)
values
  ('44444444-4444-4444-8444-000000000001'::uuid, '11111111-1111-4111-8111-000000000001'::uuid),
  ('44444444-4444-4444-8444-000000000001'::uuid, '11111111-1111-4111-8111-000000000003'::uuid);

insert into public.messages (id, conversation_id, sender_id, client_message_id, kind, body)
values (
  '55555555-5555-4555-8555-000000000001'::uuid,
  '44444444-4444-4444-8444-000000000001'::uuid,
  '11111111-1111-4111-8111-000000000001'::uuid,
  '65555555-5555-4555-8555-000000000001'::uuid,
  'audio',
  null
);

insert into public.messages (id, conversation_id, sender_id, client_message_id, kind, body)
values (
  '55555555-5555-4555-8555-000000000002'::uuid,
  '44444444-4444-4444-8444-000000000001'::uuid,
  '11111111-1111-4111-8111-000000000001'::uuid,
  '65555555-5555-4555-8555-000000000006'::uuid,
  'text',
  'Second old message reserved for cleared-report authorization'
);

insert into public.message_attachments (
  id,
  message_id,
  owner_id,
  object_path,
  mime_type,
  byte_size,
  duration_seconds,
  waveform
)
values (
  '56666666-6666-4666-8666-000000000001'::uuid,
  '55555555-5555-4555-8555-000000000001'::uuid,
  '11111111-1111-4111-8111-000000000001'::uuid,
  '11111111-1111-4111-8111-000000000001/56666666-6666-4666-8666-000000000001/audio.webm',
  'audio/webm',
  2048,
  2.5,
  '[0.1,0.5,0.9,0.4]'::jsonb
);

insert into storage.objects (id, bucket_id, name, owner_id, metadata)
values (
  '57666666-6666-4666-8666-000000000001'::uuid,
  'chat-media',
  '11111111-1111-4111-8111-000000000001/56666666-6666-4666-8666-000000000001/audio.webm',
  '11111111-1111-4111-8111-000000000001',
  '{"mimetype":"audio/webm","size":2048}'::jsonb
);

update public.messages
set body = 'Reported audio context'
where id = '55555555-5555-4555-8555-000000000001'::uuid;

insert into public.message_reactions (message_id, reactor_id, kind)
values (
  '55555555-5555-4555-8555-000000000001'::uuid,
  '11111111-1111-4111-8111-000000000001'::uuid,
  'amen'
);

insert into public.message_receipts (message_id, profile_id, delivered_at)
values (
  '55555555-5555-4555-8555-000000000001'::uuid,
  '11111111-1111-4111-8111-000000000003'::uuid,
  timezone('utc', now())
);

-- Anonymous role: no raw data or mutating RPC capability.
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select pg_temp.assert_true(auth.uid() is null, 'anon claim must not resolve an authenticated user');
select pg_temp.assert_true(
  not has_table_privilege('anon', 'public.profiles', 'SELECT'),
  'anon must not have raw profile SELECT'
);
select pg_temp.assert_true(
  not has_table_privilege('anon', 'public.messages', 'SELECT'),
  'anon must not have private message SELECT'
);
select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.get_visible_profiles(uuid,integer,integer)', 'EXECUTE'),
  'anon must not execute masked profile RPCs'
);
select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.search_discoverable_interests(text,integer,integer)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.search_discoverable_posts(text,integer,integer)', 'EXECUTE'),
  'anon must not execute Explore discovery RPCs'
);
select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.create_report(public.report_target_type,uuid,text,text)', 'EXECUTE'),
  'anon must not create reports'
);
select pg_temp.assert_true(
  not has_table_privilege('anon', 'public.report_target_attachments', 'SELECT')
    and not has_column_privilege('anon', 'public.reports', 'target_snapshot', 'SELECT'),
  'anon must not read immutable moderation snapshots or retained references'
);
select pg_temp.assert_true(
  not has_function_privilege('anon', 'public.set_conversation_favorite(uuid,boolean)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.clear_conversation_for_me(uuid)', 'EXECUTE'),
  'anon must not mutate conversation preferences'
);
reset role;

-- Owner: raw identity tables remain owner-only and user-controlled settings are writable.
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select pg_temp.assert_true(
  (select count(*) = 1 from public.profiles where id = auth.uid()),
  'owner must read own raw profile'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.profile_details where profile_id = auth.uid()),
  'owner must read own profile details'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.profile_privacy where profile_id = auth.uid()),
  'owner must read own privacy controls'
);
update public.profile_privacy
set location_visibility = 'friends'
where profile_id = auth.uid();
select pg_temp.assert_true(
  (select count(*) = 1 from public.blocks where blocker_id = auth.uid()),
  'blocker must read blocks they created'
);
select pg_temp.assert_true(
  (
    select count(*) >= 1
      and bool_and(blocked_profile_id = '11111111-1111-4111-8111-000000000004'::uuid)
    from public.get_own_blocked_profile_by_username('@rls.blocked')
  ),
  'blocker must resolve only their own blocked profile for unblock UI'
);
select public.set_community_member_role(
  '22222222-2222-4222-8222-000000000001'::uuid,
  '11111111-1111-4111-8111-000000000003'::uuid,
  'moderator'
);
select pg_temp.assert_true(
  (
    select role = 'moderator'
    from public.community_memberships
    where community_id = '22222222-2222-4222-8222-000000000001'::uuid
      and profile_id = '11111111-1111-4111-8111-000000000003'::uuid
  ),
  'only the owner RPC must promote an active community member'
);
select public.set_community_member_role(
  '22222222-2222-4222-8222-000000000001'::uuid,
  '11111111-1111-4111-8111-000000000003'::uuid,
  'member'
);
select public.ban_community_member(
  '22222222-2222-4222-8222-000000000001'::uuid,
  '11111111-1111-4111-8111-000000000009'::uuid,
  'Synthetic community safety test'
);
select pg_temp.assert_true(
  (
    select status = 'banned'
    from public.community_memberships
    where community_id = '22222222-2222-4222-8222-000000000001'::uuid
      and profile_id = '11111111-1111-4111-8111-000000000009'::uuid
  ),
  'community owner must ban a non-owner through the audited RPC'
);
select public.unban_community_member(
  '22222222-2222-4222-8222-000000000001'::uuid,
  '11111111-1111-4111-8111-000000000009'::uuid
);
select pg_temp.assert_true(
  (
    select status = 'left' and role = 'member'
    from public.community_memberships
    where community_id = '22222222-2222-4222-8222-000000000001'::uuid
      and profile_id = '11111111-1111-4111-8111-000000000009'::uuid
  ),
  'unban must restore eligibility without silently rejoining or restoring authority'
);
select public.upsert_community_rule(
  '22222222-2222-4222-8222-000000000001'::uuid,
  'Respeito',
  'Trate todas as pessoas com respeito.',
  0::smallint,
  null
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.community_rules where community_id = '22222222-2222-4222-8222-000000000001'::uuid),
  'community rule upsert must persist through the authoritative RPC'
);
select public.delete_community_rule(
  (
    select id
    from public.community_rules
    where community_id = '22222222-2222-4222-8222-000000000001'::uuid
    limit 1
  )
);
select public.reserve_post_media(
  '33333333-3333-4333-8333-000000000001'::uuid,
  '11111111-1111-4111-8111-000000000001/post/33333333-3333-4333-8333-000000000001/36666666-6666-4666-8666-000000000001.jpg',
  'image/jpeg',
  2048,
  800,
  600,
  0::smallint
);
select pg_temp.assert_true(
  (
    select status = 'deleting'
    from public.remove_post_media(
      (
        select id
        from public.post_media
        where object_path = '11111111-1111-4111-8111-000000000001/post/33333333-3333-4333-8333-000000000001/36666666-6666-4666-8666-000000000001.jpg'
      )
    )
  ),
  'post media removal must deny reads before the trusted Storage cleanup'
);
select pg_temp.assert_true(
  (
    select archived_at is not null
    from public.archive_community('22222222-2222-4222-8222-000000000003'::uuid)
  ),
  'only the active owner must archive a community through the audited RPC'
);
select pg_temp.assert_true(
  (
    select status = 'left' and joined_at is null
    from public.community_memberships
    where community_id = '22222222-2222-4222-8222-000000000003'::uuid
      and profile_id = auth.uid()
  ),
  'archiving a community must end its active memberships'
);
reset role;

-- Unrelated authenticated profile: owner-only raw tables and friend-only profile are hidden.
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;
select pg_temp.assert_true(
  (select count(*) = 0 from public.profiles where id = '11111111-1111-4111-8111-000000000001'::uuid),
  'unrelated profile must not read raw identity'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.get_visible_profiles('11111111-1111-4111-8111-000000000001'::uuid, 20, 0)),
  'unrelated profile must not read a friends-only profile'
);
select pg_temp.assert_true(
  (
    select count(*) = 0
    from public.search_discoverable_posts('Public reportable', 20, 0)
    where author_id = '11111111-1111-4111-8111-000000000001'::uuid
  ),
  'Explore must not reveal a public post when its author profile is not visible to the viewer'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.communities where id = '22222222-2222-4222-8222-000000000001'::uuid),
  'outsider must not read a private community'
);
select pg_temp.assert_true(
  (
    select count(*) = 1
      and bool_and(category = 'general')
      and bool_and(active_member_count = 3)
      and bool_and(active_post_count = 1)
    from public.get_community_discovery('22222222-2222-4222-8222-000000000001'::uuid)
  ),
  'active outsider must receive only the private-community discovery projection'
);
select public.join_community('22222222-2222-4222-8222-000000000001'::uuid);
select pg_temp.assert_true(
  (
    select count(*) = 1 and bool_and(status = 'pending')
    from public.community_memberships
    where community_id = '22222222-2222-4222-8222-000000000001'::uuid
      and profile_id = auth.uid()
  ),
  'private community join must persist a pending membership'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.communities where id = '22222222-2222-4222-8222-000000000001'::uuid),
  'pending requester must still use discovery projection rather than raw community rows'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.get_community_discovery('22222222-2222-4222-8222-000000000001'::uuid)),
  'pending requester must reload private community discovery metadata'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.messages where id = '55555555-5555-4555-8555-000000000001'::uuid),
  'outsider must not read a private message'
);
select pg_temp.assert_rejected(
  $$select public.set_conversation_favorite('44444444-4444-4444-8444-000000000001'::uuid, true)$$,
  'outsider must not favorite another conversation'
);
select pg_temp.assert_rejected(
  $$select public.clear_conversation_for_me('44444444-4444-4444-8444-000000000001'::uuid)$$,
  'outsider must not clear another conversation'
);
reset role;

-- Friend: masked RPC reveals friend-authorized location/favorites, raw rows remain private.
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-000000000003', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;
select pg_temp.assert_true(
  (select count(*) = 0 from public.profiles where id = '11111111-1111-4111-8111-000000000001'::uuid),
  'friend must still use the masked profile RPC'
);
select pg_temp.assert_true(
  (
    select count(*) = 1
      and max(state_code) = 'SP'
      and bool_and(favorite_movies <> '[]'::jsonb)
    from public.get_visible_profiles('11111111-1111-4111-8111-000000000001'::uuid, 20, 0)
  ),
  'friend must receive friend-authorized location and favorites'
);
select pg_temp.assert_true(
  (
    select count(*) = 1
      and bool_and(interest = 'cinema')
      and bool_and(profile_count = 2)
    from public.search_discoverable_interests('cinema', 20, 0)
  ),
  'Explore interest discovery must count only viewer-visible active profiles'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.search_discoverable_interests('comunidade', 20, 0)),
  'Explore interest discovery must suppress groups smaller than two profiles'
);
select pg_temp.assert_true(
  (
    select count(*) = 1
      and bool_and(post_id = '33333333-3333-4333-8333-000000000002'::uuid)
      and bool_and(author_username = 'rls.owner')
      and bool_and(community_slug = 'rls-public-community')
    from public.search_discoverable_posts('Public reportable', 20, 0)
  ),
  'friend must discover a public post through its typed privacy-aware projection'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.friendships where id = '21111111-1111-4111-8111-000000000001'::uuid),
  'friendship participants must see their relationship'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.communities where id = '22222222-2222-4222-8222-000000000001'::uuid),
  'active member must read a private community'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.community_posts where id = '33333333-3333-4333-8333-000000000001'::uuid),
  'active member must read a community-only post'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.messages where id = '55555555-5555-4555-8555-000000000001'::uuid),
  'active conversation member must read the message'
);
select pg_temp.assert_rejected(
  $$select public.send_message(
    '44444444-4444-4444-8444-000000000001'::uuid,
    'audio',
    null,
    null,
    '65555555-5555-4555-8555-000000000003'::uuid
  )$$,
  'authenticated clients must not create media messages before trusted byte validation'
);
select public.create_report(
  'message',
  '55555555-5555-4555-8555-000000000001'::uuid,
  'harassment',
  'Synthetic private-message report'
);
select public.set_conversation_favorite('44444444-4444-4444-8444-000000000001'::uuid, true);
select pg_temp.assert_true(
  (
    select count(*) = 1 and bool_and(favorited_at is not null) and bool_and(cleared_before is null)
    from public.conversation_preferences
    where conversation_id = '44444444-4444-4444-8444-000000000001'::uuid
  ),
  'favorite state must be persisted only in the current member preference row'
);
select public.clear_conversation_for_me('44444444-4444-4444-8444-000000000001'::uuid);
select pg_temp.assert_true(
  (
    select count(*) = 1 and bool_and(favorited_at is not null) and bool_and(cleared_before is not null)
    from public.conversation_preferences
    where conversation_id = '44444444-4444-4444-8444-000000000001'::uuid
  ),
  'clear must advance only the current member watermark without removing favorite state'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.messages where id = '55555555-5555-4555-8555-000000000001'::uuid)
    and (select count(*) = 0 from public.message_reactions where message_id = '55555555-5555-4555-8555-000000000001'::uuid)
    and (select count(*) = 0 from public.message_attachments where message_id = '55555555-5555-4555-8555-000000000001'::uuid)
    and (select count(*) = 0 from public.message_receipts where message_id = '55555555-5555-4555-8555-000000000001'::uuid),
  'cleared member must lose message, reaction, attachment, and receipt visibility together'
);
select pg_temp.assert_true(
  not private.can_read_storage_object(
    'chat-media',
    '11111111-1111-4111-8111-000000000001/56666666-6666-4666-8666-000000000001/audio.webm',
    auth.uid()
  ),
  'cleared member must not recover old media through the private Storage policy'
);
select pg_temp.assert_rejected(
  $$select public.send_message(
    '44444444-4444-4444-8444-000000000001'::uuid,
    'text',
    'Reply to cleared history',
    '55555555-5555-4555-8555-000000000001'::uuid,
    '65555555-5555-4555-8555-000000000004'::uuid
  )$$,
  'cleared member must not reply to cleared history'
);
select pg_temp.assert_rejected(
  $$select public.forward_message(
    '55555555-5555-4555-8555-000000000001'::uuid,
    '44444444-4444-4444-8444-000000000001'::uuid,
    '65555555-5555-4555-8555-000000000005'::uuid
  )$$,
  'cleared member must not forward cleared history'
);
select pg_temp.assert_rejected(
  $$select public.mark_message_read('55555555-5555-4555-8555-000000000001'::uuid)$$,
  'cleared member must not update receipts for cleared history'
);
select pg_temp.assert_rejected(
  $$select public.create_report(
    'message',
    '55555555-5555-4555-8555-000000000002'::uuid,
    'harassment',
    'Cleared messages cannot be recovered through reporting'
  )$$,
  'cleared member must not report cleared history'
);
select public.send_message(
  '44444444-4444-4444-8444-000000000001'::uuid,
  'text',
  'Visible after my clear watermark',
  null,
  '65555555-5555-4555-8555-000000000002'::uuid
);
select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.messages
    where conversation_id = '44444444-4444-4444-8444-000000000001'::uuid
      and client_message_id = '65555555-5555-4555-8555-000000000002'::uuid
  ),
  'messages created after clear must remain visible to the cleared member'
);
reset role;

-- Blocked profile: the block is bidirectional for visibility but visible as metadata only to blocker.
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-000000000004', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;
select pg_temp.assert_true(
  (select count(*) = 0 from public.get_visible_profiles('11111111-1111-4111-8111-000000000001'::uuid, 20, 0)),
  'blocked profile must not discover blocker'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.blocks where blocked_id = auth.uid()),
  'blocked profile must not read blocker metadata'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.get_own_blocked_profile_by_username('rls.owner')),
  'inverse block must remain indistinguishable from private or missing profile'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.get_community_discovery('22222222-2222-4222-8222-000000000001'::uuid)),
  'blocked profile must not discover communities owned by the blocker'
);
reset role;

-- Community moderator is scoped to the community and is not a global trust moderator.
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-000000000005', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-000000000005","role":"authenticated"}',
  true
);
set local role authenticated;
select public.update_community_details(
  '22222222-2222-4222-8222-000000000001'::uuid,
  'RLS Private Community',
  'Updated by scoped community moderator',
  'general',
  'private',
  null,
  null
);
select pg_temp.assert_true(
  (select description = 'Updated by scoped community moderator' from public.communities where id = '22222222-2222-4222-8222-000000000001'::uuid),
  'community moderator must manage their community'
);
select pg_temp.assert_true(
  (
    select status = 'removed'
    from public.remove_post_comment('37777777-7777-4777-8777-000000000001'::uuid)
  ),
  'community moderator must remove a community comment through the audited RPC'
);
select pg_temp.assert_true(
  (
    select status = 'removed'
    from public.remove_community_post('33333333-3333-4333-8333-000000000001'::uuid)
  ),
  'community moderator must remove a community post through the audited RPC'
);
select pg_temp.assert_true(
  not private.is_moderator(auth.uid()),
  'community moderator must not inherit global moderation'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.reports),
  'community moderator must not read the global report queue'
);
reset role;

-- A normal user reports visible content through the trusted RPC.
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;
select public.create_report(
  'community_post',
  '33333333-3333-4333-8333-000000000002'::uuid,
  'harassment',
  'Synthetic integration report'
);
select pg_temp.assert_true(
  not has_column_privilege('authenticated', 'public.reports', 'target_snapshot', 'SELECT')
    and not has_column_privilege('authenticated', 'public.reports', 'target_owner_id', 'SELECT')
    and not has_table_privilege('authenticated', 'public.report_target_attachments', 'SELECT'),
  'reporter must not receive raw snapshot columns or retained-reference table access'
);
select pg_temp.assert_rejected(
  $$select target_snapshot from public.reports limit 1$$,
  'reporter snapshot SELECT must be rejected even when the report row is visible'
);
reset role;

-- Metadata for an evidence object is enough to verify RLS; no Storage object is created.
insert into public.report_evidence (
  report_id,
  uploader_id,
  object_path,
  mime_type,
  byte_size,
  status
)
select
  report.id,
  report.reporter_id,
  report.reporter_id::text || '/' || report.id::text || '/evidence.webp',
  'image/webp',
  1024,
  'ready'
from public.reports as report
where report.target_id = '33333333-3333-4333-8333-000000000002'::uuid;

-- The accused cannot read report evidence.
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-000000000001', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select pg_temp.assert_true(
  (select count(*) = 0 from public.report_evidence),
  'reported profile must not read report evidence'
);
select pg_temp.assert_true(
  not has_column_privilege('authenticated', 'public.reports', 'target_snapshot', 'SELECT')
    and not has_table_privilege('authenticated', 'public.report_target_attachments', 'SELECT'),
  'reported target must not read snapshot content or retained attachment references'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.messages where id = '55555555-5555-4555-8555-000000000001'::uuid)
    and (
      select count(*) = 1 and bool_and(favorited_at is null) and bool_and(cleared_before is null)
      from public.conversation_preferences
      where conversation_id = '44444444-4444-4444-8444-000000000001'::uuid
    ),
  'one member clearing or favoriting must not change the other member history or preference row'
);
reset role;

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;
select pg_temp.assert_true(
  not private.can_read_storage_object(
    'chat-media',
    '11111111-1111-4111-8111-000000000001/56666666-6666-4666-8666-000000000001/audio.webm',
    auth.uid()
  ),
  'non-member/non-moderator must not read reported chat media'
);
reset role;

-- Global moderator reads the queue/evidence and the audited minimal target projection.
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-000000000006', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-000000000006","role":"authenticated"}',
  true
);
set local role authenticated;
select pg_temp.assert_true(private.is_moderator(auth.uid()), 'moderator role must pass global moderation guard');
select pg_temp.assert_true((select count(*) = 2 from public.reports), 'moderator must read report queue');
select pg_temp.assert_true((select count(*) = 1 from public.report_evidence), 'moderator must read report evidence metadata');
select pg_temp.assert_true(
  (
    select count(*) = 1
      and bool_and(target_id = '33333333-3333-4333-8333-000000000002'::uuid)
      and bool_and(content_text = 'Public reportable RLS post')
    from public.get_moderation_report_context((
      select id
      from public.reports
      where target_id = '33333333-3333-4333-8333-000000000002'::uuid
    ))
  ),
  'moderator must receive only the reported content projection'
);
select pg_temp.assert_true(
  (
    select count(*) = 1
      and bool_and(attachment_id in (
        select unnest(attachment_ids)
        from public.get_moderation_report_context((
          select id from public.reports
          where target_id = '55555555-5555-4555-8555-000000000001'::uuid
        ))
      ))
      and bool_and(source_kind = 'message_attachment')
      and bool_and(mime_type = 'audio/webm')
    from public.get_moderation_report_attachment(
      (
        select id from public.reports
        where target_id = '55555555-5555-4555-8555-000000000001'::uuid
      ),
      (
        select (attachment_ids)[1]
        from public.get_moderation_report_context((
          select id from public.reports
          where target_id = '55555555-5555-4555-8555-000000000001'::uuid
        ))
      )
    )
  ),
  'moderator must receive only metadata for the attachment on the reported message'
);
select pg_temp.assert_true(
  private.is_moderator(auth.uid())
    and private.report_target_attachment_is_retained(
      'chat-media',
      '11111111-1111-4111-8111-000000000001/56666666-6666-4666-8666-000000000001/audio.webm'
    )
    and (
      select count(*) = 1
      from storage.objects
      where bucket_id = 'chat-media'
        and name = '11111111-1111-4111-8111-000000000001/56666666-6666-4666-8666-000000000001/audio.webm'
    ),
  'moderator must read the one private Storage object linked to a report'
);
select pg_temp.assert_true(
  (
    select count(*) >= 1
    from public.audit_logs
    where event_type = 'moderation.report_context_viewed'
  ),
  'moderation context access must be audited'
);
select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.audit_logs
    where event_type = 'moderation.report_attachment_viewed'
  ),
  'moderation attachment metadata access must be audited'
);
select public.apply_moderation_action(
  (
    select id
    from public.reports
    where target_id = '55555555-5555-4555-8555-000000000001'::uuid
  ),
  'remove_content',
  'Confirmed synthetic moderation removal',
  null
);
select pg_temp.assert_true(
  (
    select count(*) = 0
    from public.message_attachments
    where message_id = '55555555-5555-4555-8555-000000000001'::uuid
  ),
  'removed message projection must not return attachment ids'
);
select pg_temp.assert_true(
  not private.can_read_storage_object(
    'chat-media',
    '11111111-1111-4111-8111-000000000001/56666666-6666-4666-8666-000000000001/audio.webm',
    auth.uid()
  ),
  'sanctioned message media must be denied immediately'
);
select pg_temp.assert_true(
  (
    select count(*) = 1
      and bool_and(cardinality(attachment_ids) = 1)
      and bool_and(content_text = 'Reported audio context')
    from public.get_moderation_report_context((
      select id
      from public.reports
      where target_id = '55555555-5555-4555-8555-000000000001'::uuid
    ))
  ),
  'moderation snapshot and retained attachment must survive live-message removal'
);
select pg_temp.assert_true(
  private.report_target_attachment_is_retained(
    'chat-media',
    '11111111-1111-4111-8111-000000000001/56666666-6666-4666-8666-000000000001/audio.webm'
  ) and (
    select count(*) = 1 from storage.objects
    where bucket_id = 'chat-media'
      and name = '11111111-1111-4111-8111-000000000001/56666666-6666-4666-8666-000000000001/audio.webm'
  ),
  'moderation-retained media must survive target removal until retention expires'
);
reset role;

-- Admin and SuperAdmin inherit the same global moderation predicate; community roles do not.
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-000000000007', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-000000000007","role":"authenticated"}',
  true
);
set local role authenticated;
select pg_temp.assert_true(private.is_moderator(auth.uid()), 'admin role must pass moderation guard');
reset role;

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-000000000008', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-000000000008","role":"authenticated"}',
  true
);
set local role authenticated;
select pg_temp.assert_true(private.is_moderator(auth.uid()), 'super_admin role must pass moderation guard');
reset role;

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-000000000009', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-000000000009","role":"authenticated"}',
  true
);
set local role authenticated;
select pg_temp.assert_true(not private.is_moderator(auth.uid()), 'support role must not pass moderation guard');
select pg_temp.assert_true((select count(*) = 0 from public.reports), 'support must not read the moderation queue');
reset role;

-- Expired temporary restrictions are effective-active immediately and can be reconciled by a
-- trusted worker without relying on the browser clock.
update public.profile_moderation_state
set status = 'restricted',
    public_reason = 'integration-expired',
    restricted_until = timezone('utc', now()) - interval '1 minute'
where profile_id = '11111111-1111-4111-8111-000000000002'::uuid;

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;
select pg_temp.assert_true(
  (select effective_status = 'active' and recorded_status = 'restricted' from public.get_own_account_status()),
  'expired restriction must be effective-active before reconciliation'
);
reset role;

set local role service_role;
select pg_temp.assert_true(
  (
    select count(*) = 1 and bool_and(delete_object)
    from public.list_message_attachment_cleanup(100)
  ),
  'trusted cleanup must expose the unreferenced sanctioned original object'
);
select public.complete_message_attachment_cleanup('56666666-6666-4666-8666-000000000001'::uuid);
select pg_temp.assert_true(
  (select count(*) = 0 from public.message_attachments where id = '56666666-6666-4666-8666-000000000001'::uuid),
  'attachment metadata must be removed only after object absence is confirmed'
);
select pg_temp.assert_true(
  (select count(*) >= 1 from public.list_post_media_cleanup(100)),
  'trusted cleanup must expose post media denied before physical deletion'
);
select public.complete_post_media_cleanup((
  select id
  from public.post_media
  where object_path = '11111111-1111-4111-8111-000000000001/post/33333333-3333-4333-8333-000000000001/36666666-6666-4666-8666-000000000001.jpg'
));
select pg_temp.assert_true(
  (
    select count(*) = 0
    from public.post_media
    where object_path = '11111111-1111-4111-8111-000000000001/post/33333333-3333-4333-8333-000000000001/36666666-6666-4666-8666-000000000001.jpg'
  ),
  'post media metadata must be removed only after object absence is confirmed'
);
select public.reconcile_expired_profile_restrictions(100);
reset role;
select pg_temp.assert_true(
  (
    select status = 'active' and restricted_until is null
    from public.profile_moderation_state
    where profile_id = '11111111-1111-4111-8111-000000000002'::uuid
  ),
  'trusted reconciliation must persist the expired restriction transition'
);

-- Profile enrichment and age privacy (migration 210000).
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select public.update_own_profile_details(
  '{
    "personality":[" Acolhedor ","Acolhedor"],
    "favorite_season":" Outono ",
    "social_energy":" Equilibrado ",
    "weekend_preferences":["Cinema"],
    "interests":["Fé","Cinema"],
    "hobbies":["Leitura"],
    "visited_places":["Recife"],
    "desired_places":["Jerusalém"]
  }'::jsonb
);
select pg_temp.assert_true(
  (
    select personality = array['Acolhedor']
      and favorite_season = 'Outono'
      and social_energy = 'Equilibrado'
      and interests = array['Fé', 'Cinema']
    from public.profile_details
    where profile_id = auth.uid()
  ),
  'owner details RPC must normalize and persist only the allowlisted enrichment fields'
);
select pg_temp.assert_rejected(
  $$select public.update_own_profile_details('{"favorite_movies":[]}'::jsonb)$$,
  'details RPC must reject favorite and non-allowlisted fields'
);
reset role;

set local role service_role;
update public.profile_moderation_state
set status = 'restricted',
    restricted_until = timezone('utc', now()) + interval '1 day'
where profile_id = '11111111-1111-4111-8111-000000000001'::uuid;
reset role;

set local role authenticated;
select pg_temp.assert_rejected(
  $$select public.update_own_profile_details('{"interests":["blocked mutation"]}'::jsonb)$$,
  'restricted accounts must not update enrichment'
);
select pg_temp.assert_rejected(
  $$update public.profile_details set favorite_movies = '[]'::jsonb where profile_id = auth.uid()$$,
  'restricted accounts must not bypass the RPC through favorite column grants'
);
select pg_temp.assert_rejected(
  $$update public.profiles set bio = 'blocked mutation' where id = auth.uid()$$,
  'restricted accounts must not mutate profile identity or biography'
);
select pg_temp.assert_rejected(
  $$update public.profile_privacy set age_visibility = 'public' where profile_id = auth.uid()$$,
  'restricted accounts must not mutate age privacy'
);
reset role;

set local role service_role;
update public.profile_moderation_state
set status = 'active',
    restricted_until = null
where profile_id = '11111111-1111-4111-8111-000000000001'::uuid;
update public.profile_privacy
set profile_visibility = 'public',
    age_visibility = 'private'
where profile_id = '11111111-1111-4111-8111-000000000001'::uuid;
reset role;

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;
select pg_temp.assert_true(
  (
    select count(*) = 1 and bool_and(not can_view_age and age_years is null)
    from public.get_visible_profile_age('11111111-1111-4111-8111-000000000001'::uuid)
  ),
  'private age must return a visible profile row without disclosing age'
);
reset role;

set local role service_role;
update public.profile_privacy
set age_visibility = 'public'
where profile_id = '11111111-1111-4111-8111-000000000001'::uuid;
reset role;

set local role authenticated;
select pg_temp.assert_true(
  (
    select count(*) = 1
      and bool_and(can_view_age)
      and min(age_years) >= 18
    from public.get_visible_profile_age('11111111-1111-4111-8111-000000000001'::uuid)
  ),
  'public age must disclose only server-derived full years to an active completed viewer'
);
reset role;

set local role service_role;
update public.profile_privacy
set age_visibility = 'friends'
where profile_id = '11111111-1111-4111-8111-000000000001'::uuid;
reset role;

set local role authenticated;
select pg_temp.assert_true(
  (
    select count(*) = 1 and bool_and(not can_view_age and age_years is null)
    from public.get_visible_profile_age('11111111-1111-4111-8111-000000000001'::uuid)
  ),
  'friends-only age must remain hidden from a stranger'
);
reset role;

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-000000000003', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;
select pg_temp.assert_true(
  (
    select count(*) = 1 and bool_and(can_view_age and age_years >= 18)
    from public.get_visible_profile_age('11111111-1111-4111-8111-000000000001'::uuid)
  ),
  'friends-only age must be visible to an accepted friend'
);
reset role;

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-000000000004', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-000000000004","role":"authenticated"}',
  true
);
set local role authenticated;
select pg_temp.assert_true(
  (
    select count(*) = 0
    from public.get_visible_profile_age('11111111-1111-4111-8111-000000000001'::uuid)
  ),
  'a block in either direction must make the age projection unavailable'
);
reset role;

set local role service_role;
update public.profile_privacy
set profile_visibility = 'private',
    age_visibility = 'public'
where profile_id = '11111111-1111-4111-8111-000000000001'::uuid;
reset role;

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-000000000002', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;
select pg_temp.assert_true(
  (
    select count(*) = 0
    from public.get_visible_profile_age('11111111-1111-4111-8111-000000000001'::uuid)
  ),
  'age visibility must never override private profile visibility'
);
reset role;

set local role service_role;
update public.profile_privacy
set profile_visibility = 'public',
    age_visibility = 'public'
where profile_id = '11111111-1111-4111-8111-000000000001'::uuid;
update public.profiles
set onboarding_completed_at = null
where id = '11111111-1111-4111-8111-000000000002'::uuid;
reset role;

set local role authenticated;
select pg_temp.assert_true(
  (
    select count(*) = 0
    from public.get_visible_profile_age('11111111-1111-4111-8111-000000000001'::uuid)
  ),
  'an onboarding-incomplete viewer must not query third-party ages'
);
reset role;

select pg_temp.assert_true(
  pg_get_function_result('public.get_visible_profile_age(uuid)'::regprocedure) not ilike '%birth_date%',
  'public age RPC result shape must never contain birth_date'
);

-- Account deletion preserves only the immutable, bounded moderation snapshot and its retained
-- object. Live author rows and source attachment metadata are removed before Auth deletion.
set local role service_role;
insert into public.account_lifecycle_requests (
  id, user_id, kind, status, requested_at, execute_after, updated_at
) values (
  '67777777-7777-4777-8777-000000000001'::uuid,
  '11111111-1111-4111-8111-000000000001'::uuid,
  'delete',
  'processing',
  timezone('utc', now()) - interval '31 days',
  timezone('utc', now()) - interval '1 day',
  timezone('utc', now())
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.list_user_storage_objects('11111111-1111-4111-8111-000000000001'::uuid)),
  'account purge inventory must exclude moderation-retained objects'
);
select public.record_account_deletion_started(
  '67777777-7777-4777-8777-000000000001'::uuid,
  0
);
select public.prepare_account_deletion('67777777-7777-4777-8777-000000000001'::uuid);
reset role;

delete from auth.users where id = '11111111-1111-4111-8111-000000000001'::uuid;

set local role service_role;
select public.record_account_deletion_completed(
  '67777777-7777-4777-8777-000000000001'::uuid,
  '11111111-1111-4111-8111-000000000001'::uuid,
  0
);
select pg_temp.assert_true(
  not exists (select 1 from public.profiles where id = '11111111-1111-4111-8111-000000000001'::uuid),
  'account deletion must remove the live profile'
);
reset role;

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-000000000006', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-000000000006","role":"authenticated"}',
  true
);
set local role authenticated;
select pg_temp.assert_true(
  (
    select count(*) = 1
      and bool_and(content_text = 'Public reportable RLS post')
      and bool_and(target_owner_id is null)
    from public.get_moderation_report_context((
      select id from public.reports
      where target_id = '33333333-3333-4333-8333-000000000002'::uuid
    ))
  ),
  'post snapshot must remain exact and anonymously reviewable after author account deletion'
);
select pg_temp.assert_true(
  (
    select count(*) = 1
      and bool_and(content_text = 'Reported audio context')
      and bool_and(cardinality(attachment_ids) = 1)
    from public.get_moderation_report_context((
      select id from public.reports
      where target_id = '55555555-5555-4555-8555-000000000001'::uuid
    ))
  ),
  'message snapshot and retained attachment reference must survive source/account deletion'
);
select pg_temp.assert_true(
  (
    select count(*) = 1 and bool_and(mime_type = 'audio/webm')
    from public.get_moderation_report_attachment(
      (
        select id from public.reports
        where target_id = '55555555-5555-4555-8555-000000000001'::uuid
      ),
      (
        select (attachment_ids)[1]
        from public.get_moderation_report_context((
          select id from public.reports
          where target_id = '55555555-5555-4555-8555-000000000001'::uuid
        ))
      )
    )
  ),
  'moderator must still receive the one retained attachment after source/account deletion'
);
reset role;

-- Terminal retention expiry removes a reference and object only when no live domain or another
-- active moderation case still owns the path.
set local role service_role;
insert into public.reports (
  id, reporter_id, target_type, target_id, category, status, resolved_at, target_snapshot
) values (
  '68888888-8888-4888-8888-000000000001'::uuid,
  '11111111-1111-4111-8111-000000000002'::uuid,
  'message',
  '68888888-8888-4888-8888-000000000005'::uuid,
  'retention_test',
  'resolved',
  timezone('utc', now()),
  '{"schema_version":1,"target_type":"message","target_id":"68888888-8888-4888-8888-000000000005","content_kind":"audio","content_text":"Expired snapshot","content_created_at":"2026-01-01T00:00:00Z"}'::jsonb
);
insert into public.moderation_cases (
  id, report_id, status, resolution, resolved_at
) values (
  '68888888-8888-4888-8888-000000000002'::uuid,
  '68888888-8888-4888-8888-000000000001'::uuid,
  'resolved',
  'Retention fixture complete',
  timezone('utc', now())
);
insert into public.report_target_attachments (
  id, report_id, source_kind, source_id, bucket_id, object_path, mime_type, byte_size,
  duration_seconds, created_at, retention_until
) values (
  '68888888-8888-4888-8888-000000000003'::uuid,
  '68888888-8888-4888-8888-000000000001'::uuid,
  'message_attachment',
  '68888888-8888-4888-8888-000000000005'::uuid,
  'chat-media',
  '11111111-1111-4111-8111-000000000002/retention/expired/audio.webm',
  'audio/webm',
  1024,
  1,
  timezone('utc', now()) - interval '200 days',
  timezone('utc', now()) - interval '10 days'
);
insert into storage.objects (id, bucket_id, name, owner_id, metadata)
values (
  '68888888-8888-4888-8888-000000000004'::uuid,
  'chat-media',
  '11111111-1111-4111-8111-000000000002/retention/expired/audio.webm',
  '11111111-1111-4111-8111-000000000002',
  '{"mimetype":"audio/webm","size":1024}'::jsonb
);
select pg_temp.assert_rejected(
  $$update public.reports
    set target_snapshot = jsonb_set(target_snapshot, '{content_text}', '"tampered"'::jsonb)
    where id = '68888888-8888-4888-8888-000000000001'::uuid$$,
  'target snapshot UPDATE must be rejected by the immutability trigger'
);
select pg_temp.assert_rejected(
  $$update public.report_target_attachments
    set mime_type = 'audio/ogg'
    where id = '68888888-8888-4888-8888-000000000003'::uuid$$,
  'retained attachment UPDATE must be rejected by the immutability trigger'
);
select pg_temp.assert_true(
  (
    select count(*) = 1 and bool_and(delete_object)
    from public.list_report_target_attachment_cleanup(100)
    where attachment_id = '68888888-8888-4888-8888-000000000003'::uuid
  ),
  'terminal expired attachment must enter cleanup with object deletion authority'
);
delete from storage.objects
where bucket_id = 'chat-media'
  and name = '11111111-1111-4111-8111-000000000002/retention/expired/audio.webm';
select public.complete_report_target_attachment_cleanup('68888888-8888-4888-8888-000000000003'::uuid);
select pg_temp.assert_true(
  not exists (
    select 1 from public.report_target_attachments
    where id = '68888888-8888-4888-8888-000000000003'::uuid
  ),
  'expired retained reference cleanup must converge after object deletion'
);
reset role;

-- Storage and Realtime are verified by catalog introspection because object upload and WebSocket
-- transport belong to the Storage/Realtime APIs, not direct SQL mutation.
select pg_temp.assert_true(
  not has_table_privilege('authenticated', 'public.communities', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.community_rules', 'INSERT')
    and not has_table_privilege('authenticated', 'public.community_rules', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.community_rules', 'DELETE')
    and not has_table_privilege('authenticated', 'public.post_media', 'INSERT')
    and not has_table_privilege('authenticated', 'public.post_media', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.post_media', 'DELETE'),
  'community administration and post media writes must remain RPC-only'
);
select pg_temp.assert_true(
  has_function_privilege('authenticated', 'public.archive_community(uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.remove_community_post(uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.reserve_post_media(uuid,text,text,bigint,integer,integer,smallint)', 'EXECUTE'),
  'authenticated clients must receive only the audited community RPC capabilities'
);
select pg_temp.assert_true(
  (
    select count(*) = 4 and bool_and(not public)
    from storage.buckets
    where id in ('profile-media', 'community-media', 'chat-media', 'report-evidence')
  ),
  'all four launch buckets must exist and remain private'
);
select pg_temp.assert_true(
  (
    select count(*) = 4
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'ORHA authenticated users can upload owned media',
        'ORHA reporters can upload evidence',
        'ORHA users can read permitted private media',
        'ORHA owners can delete orphaned uploads'
      )
  ),
  'Storage upload/orphan/read/evidence policies must be installed'
);
select pg_temp.assert_true(
  (
    select count(*) = 2
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname in (
        'ORHA conversation members can receive realtime',
        'ORHA conversation members can send realtime'
      )
      and coalesce(qual, with_check, '') like '%broadcast%'
      and coalesce(qual, with_check, '') like '%presence%'
  ),
  'Realtime Broadcast/Presence policies must be private and membership-aware'
);
select pg_temp.assert_true(
  (
    select count(*) = 14
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename in (
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
        'conversation_preferences',
        'notifications'
      )
  ),
  'all 14 client Realtime tables must be published'
);

select 'orha_rls_integration' as gate, true as passed, 'all assertions passed; transaction will roll back' as details;

rollback;
