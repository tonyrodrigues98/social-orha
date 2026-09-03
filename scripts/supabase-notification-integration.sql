-- ORHA transactional notification lifecycle gate.
-- Run only after migrations through 20260816240000 are applied:
--   npx supabase db query --linked --file scripts/supabase-notification-integration.sql --output-format json
--
-- The final ROLLBACK is intentional: Auth fixtures, communities, posts, preferences,
-- notifications, audit rows, and rate counters created here never persist.

begin;
set local statement_timeout = '60s';
set local lock_timeout = '5s';

select pg_advisory_xact_lock(hashtextextended('orha:supabase-notification-integration:v1', 0));

create function pg_temp.assert_true(condition boolean, failure_message text)
returns void
language plpgsql
as $$
begin
  if condition is distinct from true then
    raise exception 'Notification integration assertion failed: %', failure_message
      using errcode = 'P0001';
  end if;
end;
$$;

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
  ('24242424-2424-4424-8424-000000000001'::uuid, 'notice-owner@orha.invalid'),
  ('24242424-2424-4424-8424-000000000002'::uuid, 'notice-author@orha.invalid'),
  ('24242424-2424-4424-8424-000000000003'::uuid, 'notice-member@orha.invalid')
) as actor(id, email);

update public.profiles as profile
set full_name = actor.full_name,
    username = actor.username::extensions.citext,
    birth_date = date '1990-01-01',
    state_code = 'SP',
    city = 'Sao Paulo',
    onboarding_step = 6,
    onboarding_completed_at = timezone('utc', now())
from (values
  ('24242424-2424-4424-8424-000000000001'::uuid, 'Notice Owner', 'notice.owner'),
  ('24242424-2424-4424-8424-000000000002'::uuid, 'Notice Author', 'notice.author'),
  ('24242424-2424-4424-8424-000000000003'::uuid, 'Notice Member', 'notice.member')
) as actor(id, full_name, username)
where profile.id = actor.id;

select set_config(
  'request.jwt.claims',
  '{"sub":"24242424-2424-4424-8424-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select public.create_community(
  'Notification Gate Public',
  'notification-gate-public',
  'Rollback-only public community',
  'public',
  'general'
);
select public.create_community(
  'Notification Gate Private',
  'notification-gate-private',
  'Rollback-only private community',
  'private',
  'general'
);

reset role;

select set_config(
  'orha.notification_gate_private_community_id',
  (select id::text from public.communities where slug = 'notification-gate-private'),
  true
);

-- Disable the owner's optional community channel before the public joins/posts.
update public.notification_preferences
set community_enabled = false
where profile_id = '24242424-2424-4424-8424-000000000001';

select set_config(
  'request.jwt.claims',
  '{"sub":"24242424-2424-4424-8424-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select public.join_community(
  (select id from public.communities where slug = 'notification-gate-public')
);

insert into public.community_posts (author_id, community_id, body, visibility)
select
  '24242424-2424-4424-8424-000000000002'::uuid,
  community.id,
  'Optional notification must be suppressed',
  'community'
from public.communities as community
where community.slug = 'notification-gate-public';

reset role;

select pg_temp.assert_true(
  not exists (
    select 1
    from public.notifications
    where recipient_id = '24242424-2424-4424-8424-000000000001'
      and type = 'community_post_created'
      and post_id = (
        select id from public.community_posts
        where body = 'Optional notification must be suppressed'
      )
  ),
  'community preferences must suppress optional post notifications'
);

update public.notification_preferences
set community_enabled = true
where profile_id = '24242424-2424-4424-8424-000000000001';

select set_config(
  'request.jwt.claims',
  '{"sub":"24242424-2424-4424-8424-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

insert into public.community_posts (author_id, community_id, body, visibility)
select
  '24242424-2424-4424-8424-000000000002'::uuid,
  community.id,
  'Typed notification context must be delivered',
  'community'
from public.communities as community
where community.slug = 'notification-gate-public';

reset role;

select pg_temp.assert_true(
  exists (
    select 1
    from public.notifications as notification
    join public.community_posts as post on post.id = notification.post_id
    where notification.recipient_id = '24242424-2424-4424-8424-000000000001'
      and notification.type = 'community_post_created'
      and notification.entity_type = 'community_post'
      and notification.entity_id = post.id
      and notification.community_id = post.community_id
      and post.body = 'Typed notification context must be delivered'
  ),
  'community_id and post_id must be server-derived for precise deep links'
);

-- Private joins create a manager request. Decline/accept delivery remains governed
-- by the member's community preference, unlike mandatory system/moderation events.
select set_config(
  'request.jwt.claims',
  '{"sub":"24242424-2424-4424-8424-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;

select public.join_community(
  current_setting('orha.notification_gate_private_community_id')::uuid
);

reset role;

select pg_temp.assert_true(
  exists (
    select 1
    from public.notifications as notification
    join public.communities as community on community.id = notification.community_id
    where notification.recipient_id = '24242424-2424-4424-8424-000000000001'
      and notification.actor_id = '24242424-2424-4424-8424-000000000003'
      and notification.type = 'community_join_request'
      and notification.entity_type = 'community'
      and notification.entity_id = community.id
      and community.slug = 'notification-gate-private'
  ),
  'a pending private-community membership must notify a bounded manager set'
);

update public.notification_preferences
set community_enabled = false,
    system_enabled = false
where profile_id = '24242424-2424-4424-8424-000000000003';

select set_config(
  'request.jwt.claims',
  '{"sub":"24242424-2424-4424-8424-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select public.respond_to_community_membership(
  current_setting('orha.notification_gate_private_community_id')::uuid,
  '24242424-2424-4424-8424-000000000003'::uuid,
  true
);

reset role;

select pg_temp.assert_true(
  not exists (
    select 1
    from public.notifications
    where recipient_id = '24242424-2424-4424-8424-000000000003'
      and type = 'community_membership_accepted'
  ),
  'community preferences must suppress optional membership responses'
);

-- Trusted system/moderation notices are mandatory and deduplicated even when a
-- malicious client persists system_enabled=false.
select private.enqueue_notification(
  '24242424-2424-4424-8424-000000000003'::uuid,
  '24242424-2424-4424-8424-000000000001'::uuid,
  'moderation_action',
  null,
  null,
  '{"action":"warn"}'::jsonb,
  'notification-gate:mandatory-moderation',
  'system'
);
select private.enqueue_notification(
  '24242424-2424-4424-8424-000000000003'::uuid,
  '24242424-2424-4424-8424-000000000001'::uuid,
  'moderation_action',
  null,
  null,
  '{"action":"warn"}'::jsonb,
  'notification-gate:mandatory-moderation',
  'system'
);

select pg_temp.assert_true(
  (select count(*) = 1
   from public.notifications
   where recipient_id = '24242424-2424-4424-8424-000000000003'
     and type = 'moderation_action'
     and dedupe_key = 'notification-gate:mandatory-moderation'),
  'critical moderation notification must ignore system_enabled=false'
);

select pg_temp.assert_true(
  (select count(*) = 1
   from public.notifications
   where recipient_id = '24242424-2424-4424-8424-000000000003'
     and dedupe_key = 'notification-gate:mandatory-moderation'),
  'dedupe must keep exactly one critical notification'
);

rollback;
