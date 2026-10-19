-- F3 empty Sub-mission progress (user decision, 19 October 2026): a Sub-mission
-- whose owned checklist has no applicable Activity item is left out of its
-- parent's progress average (like N/A). Its isComplete still comes from its own
-- Setup/Activity/Closure gates, which the parent ANDs for every row, so the
-- parent cannot complete while it is unfinished. Forward of 41-43.
-- A left-out Sub-mission whose Activity was initialized empty (nested, or emptied
-- after use) keeps its own "empty_unconfirmed:activity" on its own page but does
-- not pass it up, so it cannot turn the parent invalid either. Applied at every
-- level, any such error still inside a left-out Sub-mission's result is its own:
-- applicable descendants have Activity rows, left-out ones were already filtered.
BEGIN;
DO $$ DECLARE definition text; patched text; BEGIN
 SELECT pg_get_functiondef('taskpulse_private.checklist_node_result(uuid,uuid[])'::regprocedure) INTO definition;
 patched:=replace(definition,
  $m$'isComplete',r->'isComplete','applicable',true,'errors',r->'errors'$m$,
  $m$'isComplete',r->'isComplete','applicable',coalesce((r->'sections'->'activity'->>'applicable')::boolean,false),
   'errors',CASE WHEN coalesce((r->'sections'->'activity'->>'applicable')::boolean,false) THEN r->'errors'
    ELSE coalesce((SELECT jsonb_agg(e) FROM jsonb_array_elements(r->'errors') e WHERE e<>to_jsonb('empty_unconfirmed:activity'::text)),'[]'::jsonb) END$m$);
 IF patched=definition THEN RAISE EXCEPTION 'checklist_node_result Sub-mission branch not found; migration 44 needs review'; END IF;
 EXECUTE patched;
END $$;
COMMIT;
SELECT taskpulse_private.m15_secure();
