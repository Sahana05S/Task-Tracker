-- ===========================================================================
-- TaskPulse — Attendance Totals in Employee Performance Snapshots
--
-- Monthly report snapshots need the attendance totals that feed dashboard
-- analytics, so historical employee reports remain readable after daily records
-- are edited later.
-- ===========================================================================

ALTER TABLE public.monthly_performance_snapshots
    ADD COLUMN IF NOT EXISTS attendance_hours NUMERIC(8, 2),
    ADD COLUMN IF NOT EXISTS payable_days NUMERIC(6, 2),
    ADD COLUMN IF NOT EXISTS absent_days NUMERIC(6, 2),
    ADD COLUMN IF NOT EXISTS leave_days NUMERIC(6, 2);
