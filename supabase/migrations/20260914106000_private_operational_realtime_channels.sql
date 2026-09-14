begin;

do $$
begin
  if to_regclass('realtime.messages') is null
    or to_regprocedure('realtime.topic()') is null
    or to_regprocedure('private.account_access_enabled(uuid)') is null
    or to_regprocedure('private.effective_profile_account_status(uuid)') is null then
    raise exception 'Private operational Realtime channel prerequisites are missing.';
  end if;
end;
$$;

drop policy if exists "Authenticated users can read own operational channels"
on realtime.messages;
create policy "Authenticated users can read own operational channels"
on realtime.messages for select to authenticated
using (
  extension in ('broadcast', 'presence')
  and private.account_access_enabled((select auth.uid()))
  and private.effective_profile_account_status((select auth.uid())) = 'active'
  and realtime.topic() in (
    'notifications:' || (select auth.uid())::text,
    'support:' || (select auth.uid())::text
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'Authenticated users can read own operational channels'
      and cmd = 'SELECT'
      and qual like '%notifications:%'
      and qual like '%support:%'
      and qual like '%auth.uid()%'
  ) then
    raise exception 'Private operational Realtime channel policy was not installed.';
  end if;
end;
$$;

commit;
