-- Cortex helper/mirror functions are SECURITY DEFINER and must NEVER be callable
-- via the PostgREST RPC surface (that would bypass RLS WITH CHECK and let a user
-- write nodes/edges into another tenant). Triggers + internal calls run as the
-- function owner and do not require EXECUTE, so revoking is safe.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'cortex\_%'
  loop
    execute format('revoke execute on function %s from anon, authenticated, public', f.sig);
  end loop;
end $$;;
