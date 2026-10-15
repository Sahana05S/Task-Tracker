-- M13: database-authoritative observation instant (15 October 2026).
-- Forward only. Default live reads, recomputation, award runs and month capture
-- take their as-of from the database clock rather than the app host clock, so
-- clock skew can neither cross the nonfuture boundary nor hide just-committed
-- records. Every existing nonfuture/cutoff validation is unchanged.
BEGIN;
CREATE FUNCTION public.observation_clock() RETURNS timestamptz LANGUAGE sql VOLATILE SET search_path='' AS $$
 SELECT clock_timestamp();
$$;
REVOKE ALL ON FUNCTION public.observation_clock() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.observation_clock() TO authenticated,service_role;
COMMIT;
