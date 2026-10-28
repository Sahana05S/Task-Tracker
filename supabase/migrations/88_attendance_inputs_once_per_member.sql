-- Migration 88: the performance sources read runs each member's attendance
-- calculation once (28 October 2026: scoring pages slow).
--
-- Measured on the demo database: performance_source_context took about
-- 380 ms, 265 ms of it in its attendance statement, while every member's
-- attendance_inputs together take about 44 ms. The statement read the result
-- through a LATERAL subquery that PostgreSQL flattens, so each of the seven
-- references to it re-ran attendance_inputs. OFFSET 0 keeps the subquery as one
-- evaluation per member. Same function, same arguments, same result.
--
-- Patched in performance_source_context and in its copy that
-- live_presentation_context uses (presentation_performance_sources, migration
-- 28); each fragment must appear exactly once, as in migration 76.

BEGIN;

DO $$
DECLARE fn regprocedure; def text;
 frag text:='CROSS JOIN LATERAL (SELECT taskpulse_private.attendance_inputs((u->>''id'')::uuid,p_from,p_to_exclusive,p_as_of) a) q;';
 repl text:='CROSS JOIN LATERAL (SELECT taskpulse_private.attendance_inputs((u->>''id'')::uuid,p_from,p_to_exclusive,p_as_of) a OFFSET 0) q;';
BEGIN
 FOREACH fn IN ARRAY ARRAY['public.performance_source_context(date,date,timestamptz)'::regprocedure,
                           'taskpulse_private.presentation_performance_sources(date,date,timestamptz)'::regprocedure] LOOP
  def:=pg_catalog.pg_get_functiondef(fn);
  IF (length(def)-length(replace(def,frag,'')))/length(frag)<>1 THEN
   RAISE EXCEPTION '% no longer has exactly one attendance LATERAL; update migration 88',fn; END IF;
  EXECUTE replace(def,frag,repl);
 END LOOP;
END $$;

COMMIT;
SELECT taskpulse_private.m15_secure();
