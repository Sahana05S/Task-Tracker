-- Commit enum additions before migration 16 uses them. Preserve existing labels.
ALTER TYPE public.task_freshness ADD VALUE IF NOT EXISTS 'Super Fresh';
ALTER TYPE public.task_freshness ADD VALUE IF NOT EXISTS 'Almost Fresh';
ALTER TYPE public.task_freshness ADD VALUE IF NOT EXISTS 'Almost Stale';
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'Stopped';
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'On-Hold';
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'Carryover';
