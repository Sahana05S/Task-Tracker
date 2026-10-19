-- Removing a Sub-mission row: in the same command, its owned checklist (and,
-- by cascade, its sections) goes first, but only while that checklist has no
-- rows in any section. Authorization, open-date, version, idempotency, reason
-- and audit handling stay those of the ordinary delete. Forward of 41/42.
BEGIN;
DO $$ DECLARE definition text; patched text; BEGIN
 SELECT pg_get_functiondef('public.checklist_command(uuid,text,jsonb,bigint,uuid)'::regprocedure) INTO definition;
 patched:=replace(definition,
  $m$   DELETE FROM public.checklist_nodes WHERE id=n.id;$m$,
  $m$   SELECT id INTO owned_id FROM public.task_checklists WHERE owner_node_id=n.id FOR UPDATE;
   IF owned_id IS NOT NULL THEN
    IF EXISTS(SELECT 1 FROM public.checklist_nodes WHERE checklist_id=owned_id) THEN RAISE EXCEPTION 'Remove the items inside this Sub-mission first.' USING ERRCODE='23514'; END IF;
    DELETE FROM public.task_checklists WHERE id=owned_id;
   END IF;
   DELETE FROM public.checklist_nodes WHERE id=n.id;$m$);
 IF patched=definition THEN RAISE EXCEPTION 'checklist_command delete branch not found; migration 43 needs review'; END IF;
 EXECUTE patched;
END $$;
COMMIT;
SELECT taskpulse_private.m15_secure();
