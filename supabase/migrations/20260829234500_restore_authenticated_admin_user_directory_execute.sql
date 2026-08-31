-- Super Admin calls guarded SECURITY DEFINER RPCs with an authenticated session.
-- Every admin_* RPC currently enforces admin_users, is_admin(auth.uid()), or
-- get_my_admin_role() internally. Anonymous/public execution stays forbidden.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'admin\_%' escape '\'
  loop
    execute format('revoke all on function %s from public, anon', r.signature);
    execute format('grant execute on function %s to authenticated, service_role', r.signature);
  end loop;
end $$;
