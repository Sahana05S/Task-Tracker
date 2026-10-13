-- ===========================================================================
-- TaskPulse — Checklist Progress Sync
--
-- Lets a master checklist be configured as the source of truth for a task's
-- progress percentage. Application actions recompute the equal-weight checklist
-- rollup and write it back to tasks.progress_percentage only when this flag is
-- enabled.
-- ===========================================================================

ALTER TABLE public.task_checklists
    ADD COLUMN IF NOT EXISTS sync_progress_to_task BOOLEAN NOT NULL DEFAULT false;
