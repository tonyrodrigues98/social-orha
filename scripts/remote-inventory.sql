select json_build_object(
  'server_version', current_setting('server_version'),
  'migration_versions', coalesce((select json_agg(version order by version) from supabase_migrations.schema_migrations), '[]'::json),
  'public_tables', coalesce((select json_agg(tablename order by tablename) from pg_tables where schemaname = 'public'), '[]'::json),
  'rls_tables', coalesce((select json_agg(relname order by relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity), '[]'::json),
  'policies', coalesce((select json_agg(json_build_object('table', tablename, 'policy', policyname, 'roles', roles, 'cmd', cmd) order by tablename, policyname) from pg_policies where schemaname = 'public'), '[]'::json),
  'buckets', coalesce((select json_agg(json_build_object('id', id, 'public', public, 'file_size_limit', file_size_limit, 'allowed_mime_types', allowed_mime_types) order by id) from storage.buckets), '[]'::json),
  'realtime_tables', coalesce((select json_agg(schemaname || '.' || tablename order by schemaname, tablename) from pg_publication_tables where pubname = 'supabase_realtime'), '[]'::json)
);
