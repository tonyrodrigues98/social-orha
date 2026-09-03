-- ORHA remote schema snapshot.
-- This query is metadata-only: it never reads application row values and never mutates the database.

begin transaction read only;
set local statement_timeout = '30s';
set local lock_timeout = '3s';

select jsonb_pretty(
  jsonb_build_object(
    'captured_at', statement_timestamp(),
    'database', current_database(),
    'server_version', current_setting('server_version'),
    'extensions', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'name', extension.extname,
            'version', extension.extversion,
            'schema', namespace.nspname
          )
          order by extension.extname
        ),
        '[]'::jsonb
      )
      from pg_extension as extension
      join pg_namespace as namespace on namespace.oid = extension.extnamespace
    ),
    'applied_migrations', (
      select coalesce(
        jsonb_agg(migration.version order by migration.version),
        '[]'::jsonb
      )
      from supabase_migrations.schema_migrations as migration
    ),
    'public_tables', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'name', class.relname,
            'rls_enabled', class.relrowsecurity,
            'rls_forced', class.relforcerowsecurity,
            'estimated_rows', greatest(class.reltuples::bigint, 0),
            'total_bytes', pg_total_relation_size(class.oid)
          )
          order by class.relname
        ),
        '[]'::jsonb
      )
      from pg_class as class
      join pg_namespace as namespace on namespace.oid = class.relnamespace
      where namespace.nspname = 'public'
        and class.relkind in ('r', 'p')
    ),
    'public_policies', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'table', policy.tablename,
            'name', policy.policyname,
            'permissive', policy.permissive,
            'roles', policy.roles,
            'command', policy.cmd,
            'using', policy.qual,
            'with_check', policy.with_check
          )
          order by policy.tablename, policy.policyname
        ),
        '[]'::jsonb
      )
      from pg_policies as policy
      where policy.schemaname = 'public'
    ),
    'public_functions', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'name', procedure.proname,
            'identity_arguments', pg_get_function_identity_arguments(procedure.oid),
            'security_definer', procedure.prosecdef,
            'configuration', coalesce(to_jsonb(procedure.proconfig), '[]'::jsonb)
          )
          order by procedure.proname, pg_get_function_identity_arguments(procedure.oid)
        ),
        '[]'::jsonb
      )
      from pg_proc as procedure
      join pg_namespace as namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
    ),
    'public_triggers', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'table', class.relname,
            'name', trigger.tgname,
            'enabled', trigger.tgenabled,
            'definition', pg_get_triggerdef(trigger.oid, true)
          )
          order by class.relname, trigger.tgname
        ),
        '[]'::jsonb
      )
      from pg_trigger as trigger
      join pg_class as class on class.oid = trigger.tgrelid
      join pg_namespace as namespace on namespace.oid = class.relnamespace
      where namespace.nspname = 'public'
        and not trigger.tgisinternal
    ),
    'public_constraints', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'table', class.relname,
            'name', constraint_record.conname,
            'type', constraint_record.contype,
            'validated', constraint_record.convalidated,
            'definition', pg_get_constraintdef(constraint_record.oid, true)
          )
          order by class.relname, constraint_record.conname
        ),
        '[]'::jsonb
      )
      from pg_constraint as constraint_record
      join pg_class as class on class.oid = constraint_record.conrelid
      join pg_namespace as namespace on namespace.oid = class.relnamespace
      where namespace.nspname = 'public'
    ),
    'client_grants', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'table', grant_record.table_name,
            'grantee', grant_record.grantee,
            'privilege', grant_record.privilege_type
          )
          order by grant_record.table_name, grant_record.grantee, grant_record.privilege_type
        ),
        '[]'::jsonb
      )
      from information_schema.table_privileges as grant_record
      where grant_record.table_schema = 'public'
        and grant_record.grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
    ),
    'storage_buckets', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', bucket.id,
            'name', bucket.name,
            'public', bucket.public,
            'file_size_limit', bucket.file_size_limit,
            'allowed_mime_types', bucket.allowed_mime_types,
            'created_at', bucket.created_at,
            'updated_at', bucket.updated_at
          )
          order by bucket.id
        ),
        '[]'::jsonb
      )
      from storage.buckets as bucket
    ),
    'realtime_publication_tables', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'schema', publication.schemaname,
            'table', publication.tablename
          )
          order by publication.schemaname, publication.tablename
        ),
        '[]'::jsonb
      )
      from pg_publication_tables as publication
      where publication.pubname = 'supabase_realtime'
    )
  )
) as snapshot_json;

commit;
