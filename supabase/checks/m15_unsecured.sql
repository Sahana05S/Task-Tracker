-- Objects m15_secure() would still change: tables not owned by taskpulse_definer
-- or without forced row security and the m15_scope policy, and functions not
-- owned by taskpulse_definer outside m15_secure's own allowlist. One line per
-- object; no output means every object is secured. Read-only. The empty
-- search_path matches m15_secure, so signatures keep their schema.
SET search_path TO '';
WITH allow(sig) AS (VALUES
  ('public.current_organization()'),('public.get_user_role()'),('public.handle_new_user()'),
  ('taskpulse_private.m15_organization()'),('taskpulse_private.m15_scope()'),
  ('taskpulse_private.m15_unscoped()'),('taskpulse_private.m15_secure()'))
SELECT 'table '||n.nspname||'.'||c.relname
FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','taskpulse_private') AND c.relkind='r'
  AND (pg_catalog.pg_get_userbyid(c.relowner)<>'taskpulse_definer' OR NOT c.relrowsecurity OR NOT c.relforcerowsecurity
       OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_policies p WHERE p.schemaname=n.nspname AND p.tablename=c.relname AND p.policyname='m15_scope'))
UNION ALL
SELECT 'function '||p.oid::regprocedure::text
FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('public','taskpulse_private') AND pg_catalog.pg_get_userbyid(p.proowner)<>'taskpulse_definer'
  AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_depend d WHERE d.objid=p.oid AND d.deptype='e')
  AND p.oid::regprocedure::text NOT IN (SELECT sig FROM allow)
ORDER BY 1;
