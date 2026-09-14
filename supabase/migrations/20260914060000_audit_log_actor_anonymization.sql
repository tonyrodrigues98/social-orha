-- Audit rows remain immutable while account deletion may anonymize their actor FK.

create or replace function private.reject_audit_log_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and old.actor_id is not null
    and new.actor_id is null
    and (to_jsonb(new) - 'actor_id') = (to_jsonb(old) - 'actor_id') then
    return new;
  end if;

  raise exception 'Audit logs are append-only.' using errcode = '55000';
end;
$$;

revoke all on function private.reject_audit_log_mutation() from public, anon, authenticated;

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('private.reject_audit_log_mutation()'::regprocedure)
  into function_definition;

  if position('old.actor_id is not null' in function_definition) = 0
    or position('new.actor_id is null' in function_definition) = 0
    or position('to_jsonb(new) - ''actor_id''' in function_definition) = 0 then
    raise exception 'Audit-log actor anonymization guard is incomplete.' using errcode = '55000';
  end if;
end
$$;
