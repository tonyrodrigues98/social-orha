-- ORHA release validation for the linked Supabase project.
-- Every statement is read-only. A failed check is returned as data and never "fixed" automatically.

begin transaction read only;
set local statement_timeout = '30s';
set local lock_timeout = '3s';

with
expected_migrations(version) as (
  values
    ('20260811040000'),
    ('20260816130000'),
    ('20260816170000'),
    ('20260816180000'),
    ('20260816190000'),
    ('20260816200000'),
    ('20260816210000'),
    ('20260816220000'),
    ('20260816230000'),
    ('20260816240000'),
    ('20260816250000'),
    ('20260903010000'),
    ('20260914050000'),
    ('20260914060000'),
    ('20260914070000'),
    ('20260914080000'),
    ('20260914090000'),
    ('20260914100000'),
    ('20260914101000'),
    ('20260914102000'),
    ('20260914103000'),
    ('20260914104000')
),
missing_migrations as (
  select expected.version
  from expected_migrations as expected
  left join supabase_migrations.schema_migrations as applied
    on applied.version = expected.version
  where applied.version is null
),
expected_tables(table_name) as (
  values
    ('profiles'),
    ('profile_details'),
    ('profile_privacy'),
    ('user_roles'),
    ('friendships'),
    ('profile_moderation_state'),
    ('notification_preferences'),
    ('user_settings'),
    ('account_lifecycle_requests'),
    ('blocks'),
    ('profile_media'),
    ('communities'),
    ('community_memberships'),
    ('community_rules'),
    ('community_posts'),
    ('post_media'),
    ('post_comments'),
    ('post_reactions'),
    ('conversations'),
    ('conversation_members'),
    ('conversation_preferences'),
    ('conversation_requests'),
    ('messages'),
    ('message_reactions'),
    ('message_attachments'),
    ('message_receipts'),
    ('notifications'),
    ('reports'),
    ('report_evidence'),
    ('moderation_cases'),
    ('sanctions'),
    ('audit_logs'),
    ('account_export_artifacts'),
    ('account_deletion_tombstones'),
    ('community_branding_media'),
    ('community_branding_cleanup'),
    ('orphan_media_cleanup_claims'),
    ('report_target_attachments'),
    ('support_tickets'),
    ('support_ticket_messages')
),
missing_tables as (
  select expected.table_name
  from expected_tables as expected
  where to_regclass(format('public.%I', expected.table_name)) is null
),
public_tables_without_rls as (
  select class.relname as table_name
  from pg_class as class
  join pg_namespace as namespace on namespace.oid = class.relnamespace
  where namespace.nspname = 'public'
    and class.relkind in ('r', 'p')
    and not class.relrowsecurity
),
unsafe_anon_grants as (
  select distinct grant_record.table_name, grant_record.grantee, grant_record.privilege_type
  from information_schema.table_privileges as grant_record
  where grant_record.table_schema = 'public'
    and grant_record.grantee in ('anon', 'PUBLIC')
    and grant_record.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES')
),
unsafe_security_definer_functions as (
  select procedure.proname || '(' || pg_get_function_identity_arguments(procedure.oid) || ')' as function_name
  from pg_proc as procedure
  join pg_namespace as namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.prosecdef
    and not exists (
      select 1
      from unnest(coalesce(procedure.proconfig, array[]::text[])) as setting
      where setting like 'search_path=%'
    )
),
unvalidated_constraints as (
  select class.relname || '.' || constraint_record.conname as constraint_name
  from pg_constraint as constraint_record
  join pg_class as class on class.oid = constraint_record.conrelid
  join pg_namespace as namespace on namespace.oid = class.relnamespace
  where namespace.nspname in ('public', 'storage')
    and not constraint_record.convalidated
),
expected_buckets(bucket_id) as (
  values
    ('profile-media'),
    ('community-media'),
    ('chat-media'),
    ('report-evidence'),
    ('account-exports')
),
missing_buckets as (
  select expected.bucket_id
  from expected_buckets as expected
  left join storage.buckets as bucket on bucket.id = expected.bucket_id
  where bucket.id is null
),
unexpected_public_private_buckets as (
  select bucket.id
  from storage.buckets as bucket
  where bucket.id in ('profile-media', 'community-media', 'chat-media', 'report-evidence', 'account-exports')
    and bucket.public
),
expected_realtime_tables(table_name) as (
  values
    ('friendships'),
    ('blocks'),
    ('community_memberships'),
    ('community_posts'),
    ('post_comments'),
    ('post_reactions'),
    ('conversation_members'),
    ('conversation_requests'),
    ('conversation_preferences'),
    ('messages'),
    ('message_reactions'),
    ('message_attachments'),
    ('message_receipts'),
    ('notifications'),
    ('support_tickets'),
    ('support_ticket_messages')
),
missing_realtime_tables as (
  select expected.table_name
  from expected_realtime_tables as expected
  left join pg_publication_tables as publication
    on publication.pubname = 'supabase_realtime'
   and publication.schemaname = 'public'
   and publication.tablename = expected.table_name
  where publication.tablename is null
),
expected_storage_policies(policy_name) as (
  values
    ('ORHA authenticated users can upload owned media'),
    ('ORHA reporters can upload evidence'),
    ('ORHA users can read permitted private media'),
    ('ORHA owners can delete orphaned uploads')
),
missing_storage_policies as (
  select expected.policy_name
  from expected_storage_policies as expected
  left join pg_policies as policy
    on policy.schemaname = 'storage'
   and policy.tablename = 'objects'
   and policy.policyname = expected.policy_name
  where policy.policyname is null
),
expected_realtime_policies(policy_name) as (
  values
    ('ORHA conversation members can receive realtime'),
    ('ORHA conversation members can send realtime')
),
missing_realtime_policies as (
  select expected.policy_name
  from expected_realtime_policies as expected
  left join pg_policies as policy
    on policy.schemaname = 'realtime'
   and policy.tablename = 'messages'
   and policy.policyname = expected.policy_name
  where policy.policyname is null
),
expected_functions(function_signature) as (
  values
    ('public.search_visible_profiles(text,integer,integer)'),
    ('public.search_discoverable_interests(text,integer,integer)'),
    ('public.search_discoverable_posts(text,integer,integer)'),
    ('public.get_own_blocked_profile_by_username(text)'),
    ('public.get_community_discovery(uuid)'),
    ('public.update_community_details(uuid,text,text,text,public.community_visibility,text,text)'),
    ('public.archive_community(uuid)'),
    ('public.upsert_community_rule(uuid,text,text,smallint,uuid)'),
    ('public.delete_community_rule(uuid)'),
    ('public.set_community_member_role(uuid,uuid,public.community_role)'),
    ('public.ban_community_member(uuid,uuid,text)'),
    ('public.unban_community_member(uuid,uuid)'),
    ('public.remove_community_post(uuid)'),
    ('public.remove_post_comment(uuid)'),
    ('public.reserve_post_media(uuid,text,text,bigint,integer,integer,smallint)'),
    ('public.finalize_post_media(uuid)'),
    ('public.remove_post_media(uuid)'),
    ('public.list_post_media_cleanup(integer)'),
    ('public.complete_post_media_cleanup(uuid)'),
    ('public.send_message(uuid,public.message_kind,text,uuid,uuid)'),
    ('public.set_conversation_favorite(uuid,boolean)'),
    ('public.clear_conversation_for_me(uuid)'),
    ('public.create_report(public.report_target_type,uuid,text,text)'),
    ('public.get_moderation_report_context(uuid)'),
    ('public.get_moderation_report_attachment(uuid,uuid)'),
    ('public.get_own_account_status()'),
    ('public.reconcile_expired_profile_restrictions(integer)'),
    ('public.list_message_attachment_cleanup(integer)'),
    ('public.complete_message_attachment_cleanup(uuid)'),
    ('public.request_account_lifecycle(public.account_lifecycle_kind,text)'),
    ('public.complete_own_onboarding()'),
    ('public.update_own_profile_details(jsonb)'),
    ('public.get_visible_profile_age(uuid)'),
    ('public.get_home_dashboard_summary(integer)'),
    ('public.cleanup_actor_rate_limit_windows(integer)'),
    ('public.create_support_ticket(text,public.support_ticket_category,text)'),
    ('public.reply_support_ticket(uuid,text)'),
    ('public.claim_support_ticket(uuid)'),
    ('public.update_support_ticket_state(uuid,public.support_ticket_status,public.support_ticket_priority)'),
    ('public.list_support_tickets(public.support_ticket_status,integer,timestamptz,uuid)'),
    ('public.list_support_ticket_messages(uuid,integer,timestamptz,uuid)'),
    ('public.list_global_role_assignments(text,integer,timestamptz,uuid)'),
    ('public.assign_global_role(uuid,public.app_role,text)')
),
missing_functions as (
  select function_signature
  from expected_functions
  where to_regprocedure(function_signature) is null
),
message_idempotency_columns as (
  select count(*) = 3 as present
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'messages'
    and column_name in ('conversation_id', 'sender_id', 'client_message_id')
),
message_idempotency_index as (
  select exists (
    select 1
    from pg_indexes as index_record
    where index_record.schemaname = 'public'
      and index_record.tablename = 'messages'
      and index_record.indexdef ilike '%unique%'
      and index_record.indexdef ilike '%conversation_id%'
      and index_record.indexdef ilike '%sender_id%'
      and index_record.indexdef ilike '%client_message_id%'
  ) as present
),
conversation_preference_control_columns as (
  select count(*) = 2 as present
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'conversation_preferences'
    and column_name in ('favorited_at', 'cleared_before')
),
profile_age_privacy_column as (
  select count(*) = 1 as present
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profile_privacy'
    and column_name = 'age_visibility'
    and udt_name = 'profile_visibility'
),
notification_context_columns as (
  select count(*) = 2 as present
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'notifications'
    and column_name in ('community_id', 'post_id')
    and data_type = 'uuid'
),
abuse_control_contract as (
  select
    to_regclass('private.actor_rate_limit_policies') is not null
    and to_regclass('private.actor_rate_limit_windows') is not null
    and to_regprocedure('private.consume_actor_rate_limits(uuid,text)') is not null
    and (
      select count(*) = 6
      from pg_trigger
      where tgname in (
        'enforce_friendship_request_rate_limit',
        'enforce_conversation_request_rate_limit',
        'enforce_community_post_create_rate_limit',
        'enforce_post_comment_create_rate_limit',
        'enforce_message_send_rate_limit',
        'enforce_report_create_rate_limit'
      )
        and not tgisinternal
        and tgenabled <> 'D'
    ) as present
),
worker_scheduler_contract as (
  select
    exists (select 1 from pg_extension where extname = 'pg_cron')
    and exists (select 1 from pg_extension where extname = 'pg_net')
    and to_regprocedure('private.invoke_orha_worker(text,integer)') is not null
    and to_regprocedure('private.configure_orha_worker_schedules()') is not null
    and not has_function_privilege('anon', 'private.invoke_orha_worker(text,integer)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.invoke_orha_worker(text,integer)', 'EXECUTE')
    and not has_function_privilege('service_role', 'private.invoke_orha_worker(text,integer)', 'EXECUTE')
    as present
),
onboarding_completion_contract as (
  select
    to_regprocedure('public.complete_own_onboarding()') is not null
    and has_function_privilege(
      'authenticated',
      'public.complete_own_onboarding()',
      'EXECUTE'
    )
    and not has_function_privilege(
      'anon',
      'public.complete_own_onboarding()',
      'EXECUTE'
    )
    and not has_column_privilege(
      'authenticated',
      'public.profiles',
      'onboarding_completed_at',
      'UPDATE'
    ) as present
),
support_operations_contract as (
  select
    to_regprocedure('private.is_support_operator(uuid)') is not null
    and to_regprocedure('private.can_access_support_ticket(uuid,uuid)') is not null
    and (
      select count(*) = 2
      from pg_policies
      where schemaname = 'public'
        and tablename in ('support_tickets', 'support_ticket_messages')
    )
    and not has_table_privilege('authenticated', 'public.support_tickets', 'INSERT')
    and not has_table_privilege('authenticated', 'public.support_tickets', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.support_ticket_messages', 'INSERT')
    and exists (
      select 1
      from private.actor_rate_limit_policies
      where action = 'support_ticket_create'
    )
    and exists (
      select 1
      from private.actor_rate_limit_policies
      where action = 'support_ticket_reply'
    ) as present
),
global_role_management_contract as (
  select
    to_regprocedure('private.is_global_role_manager(uuid)') is not null
    and not has_table_privilege('authenticated', 'public.user_roles', 'INSERT')
    and not has_table_privilege('authenticated', 'public.user_roles', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.user_roles', 'DELETE')
    and not has_function_privilege('anon', 'public.list_global_role_assignments(text,integer,timestamptz,uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.assign_global_role(uuid,public.app_role,text)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.list_global_role_assignments(text,integer,timestamptz,uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.assign_global_role(uuid,public.app_role,text)', 'EXECUTE')
    and (
      select count(*) = 2
      from private.actor_rate_limit_policies
      where action = 'global_role_change'
    ) as present
),
analytics_consent_contract as (
  select
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'user_settings'
        and column_name = 'analytics_enabled'
        and is_nullable = 'NO'
        and column_default = 'false'
    )
    and exists (
      select 1
      from pg_trigger
      where tgrelid = 'public.user_settings'::regclass
        and tgname = 'user_settings_stamp_analytics_consent'
        and not tgisinternal
    )
    and has_column_privilege('authenticated', 'public.user_settings', 'analytics_enabled', 'UPDATE')
    and not has_column_privilege(
      'authenticated',
      'public.user_settings',
      'analytics_consent_updated_at',
      'UPDATE'
    ) as present
),
username_unique_index as (
  select exists (
    select 1
    from pg_indexes as index_record
    where index_record.schemaname = 'public'
      and index_record.tablename = 'profiles'
      and index_record.indexdef ilike '%unique%'
      and index_record.indexdef ilike '%username%'
  ) as present
),
checks(check_order, check_name, passed, details) as (
  select
    10,
    'required_migrations_applied',
    not exists (select 1 from missing_migrations),
    coalesce((select string_agg(version, ', ' order by version) from missing_migrations), 'all expected migrations are applied')
  union all
  select
    20,
    'required_tables_present',
    not exists (select 1 from missing_tables),
    coalesce((select string_agg(table_name, ', ' order by table_name) from missing_tables), 'all required tables are present')
  union all
  select
    30,
    'rls_enabled_on_public_tables',
    not exists (select 1 from public_tables_without_rls),
    coalesce((select string_agg(table_name, ', ' order by table_name) from public_tables_without_rls), 'RLS is enabled on every public table')
  union all
  select
    40,
    'no_anon_write_grants',
    not exists (select 1 from unsafe_anon_grants),
    coalesce(
      (
        select string_agg(table_name || ':' || grantee || ':' || privilege_type, ', ' order by table_name, grantee, privilege_type)
        from unsafe_anon_grants
      ),
      'anon and PUBLIC have no direct write grants'
    )
  union all
  select
    50,
    'security_definer_search_path_pinned',
    not exists (select 1 from unsafe_security_definer_functions),
    coalesce((select string_agg(function_name, ', ' order by function_name) from unsafe_security_definer_functions), 'all SECURITY DEFINER functions pin search_path')
  union all
  select
    60,
    'constraints_validated',
    not exists (select 1 from unvalidated_constraints),
    coalesce((select string_agg(constraint_name, ', ' order by constraint_name) from unvalidated_constraints), 'all public and storage constraints are validated')
  union all
  select
    70,
    'required_storage_buckets_present',
    not exists (select 1 from missing_buckets),
    coalesce((select string_agg(bucket_id, ', ' order by bucket_id) from missing_buckets), 'all required buckets are present')
  union all
  select
    80,
    'private_buckets_are_private',
    not exists (select 1 from unexpected_public_private_buckets),
    coalesce((select string_agg(id, ', ' order by id) from unexpected_public_private_buckets), 'all five application and export buckets are private')
  union all
  select
    90,
    'realtime_publication_complete',
    not exists (select 1 from missing_realtime_tables),
    coalesce((select string_agg(table_name, ', ' order by table_name) from missing_realtime_tables), 'required Realtime tables are published')
  union all
  select
    92,
    'storage_policies_complete',
    not exists (select 1 from missing_storage_policies),
    coalesce((select string_agg(policy_name, ', ' order by policy_name) from missing_storage_policies), 'required private Storage policies are installed')
  union all
  select
    94,
    'realtime_authorization_policies_complete',
    not exists (select 1 from missing_realtime_policies),
    coalesce((select string_agg(policy_name, ', ' order by policy_name) from missing_realtime_policies), 'private Realtime authorization policies are installed')
  union all
  select
    96,
    'critical_functions_present',
    not exists (select 1 from missing_functions),
    coalesce((select string_agg(function_signature, ', ' order by function_signature) from missing_functions), 'all security-critical RPCs are present')
  union all
  select
    100,
    'username_unique_server_side',
    (select present from username_unique_index),
    case when (select present from username_unique_index) then 'profiles.username has a unique index' else 'profiles.username needs a unique server-side index' end
  union all
  select
    110,
    'message_idempotency_contract',
    (select present from message_idempotency_columns) and (select present from message_idempotency_index),
    case
      when not (select present from message_idempotency_columns) then 'messages is missing conversation_id, sender_id, or client_message_id'
      when not (select present from message_idempotency_index) then 'messages needs a unique index over conversation_id, sender_id, and client_message_id'
      else 'message idempotency columns and unique index are present'
    end
  union all
  select
    120,
    'conversation_preference_controls',
    (select present from conversation_preference_control_columns),
    case
      when (select present from conversation_preference_control_columns)
        then 'per-user favorite and clear watermark columns are present'
      else 'conversation_preferences needs favorited_at and cleared_before'
    end
  union all
  select
    130,
    'profile_age_privacy_contract',
    (select present from profile_age_privacy_column),
    case
      when (select present from profile_age_privacy_column)
        then 'profile age visibility and RPC dependencies are present'
      else 'profile_privacy needs the typed age_visibility column'
    end
  union all
  select
    140,
    'notification_deep_link_context',
    (select present from notification_context_columns),
    case
      when (select present from notification_context_columns)
        then 'notifications has typed community_id and post_id context'
      else 'notifications needs server-derived community_id and post_id columns'
    end
  union all
  select
    150,
    'abuse_rate_limit_contract',
    (select present from abuse_control_contract),
    case
      when (select present from abuse_control_contract)
        then 'all six protected mutations have private authoritative rate limits'
      else 'private abuse-control tables, consumer, or triggers are incomplete'
    end
  union all
  select
    160,
    'worker_scheduler_contract',
    (select present from worker_scheduler_contract),
    case
      when (select present from worker_scheduler_contract)
        then 'pg_cron, pg_net, and private worker scheduler functions are installed'
      else 'worker scheduler extensions, functions, or grants are incomplete'
    end
  union all
  select
    170,
    'onboarding_completion_contract',
    (select present from onboarding_completion_contract),
    case
      when (select present from onboarding_completion_contract)
        then 'onboarding completion is authenticated, RPC-only, and server-authoritative'
      else 'onboarding completion RPC or least-privilege grants are incomplete'
    end
  union all
  select
    180,
    'support_operations_contract',
    (select present from support_operations_contract),
    case
      when (select present from support_operations_contract)
        then 'support tickets are persistent, RLS-protected, RPC-only, rate-limited, and operator-scoped'
      else 'support tables, policies, RPC authority, or abuse controls are incomplete'
    end
  union all
  select
    190,
    'global_role_management_contract',
    (select present from global_role_management_contract),
    case
      when (select present from global_role_management_contract)
        then 'global roles are RPC-only, least-privilege, rate-limited, and server-authoritative'
      else 'global role functions, grants, or rate limits are incomplete'
    end
  union all
  select
    200,
    'analytics_consent_contract',
    (select present from analytics_consent_contract),
    case
      when (select present from analytics_consent_contract)
        then 'analytics is disabled by default, owner-controlled, and server-timestamped'
      else 'analytics consent columns, trigger, or least-privilege grants are incomplete'
    end
)
select check_name, passed, details
from checks
order by check_order;

commit;
