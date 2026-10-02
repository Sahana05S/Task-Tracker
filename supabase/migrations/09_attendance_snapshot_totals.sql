-- ===========================================================================
-- TaskPulse — Attendance Totals in Employee Performance Snapshots
--
-- Monthly report snapshots need the attendance totals that feed dashboard
-- analytics, so historical employee reports remain readable after daily records
-- are edited later.
-- ===========================================================================

ALTER TABLE public.monthly_performance_snapshots
    ADD COLUMN attendance_hours NUMERIC(8, 2),
    ADD COLUMN payable_days NUMERIC(6, 2),
    ADD COLUMN absent_days NUMERIC(6, 2),
    ADD COLUMN leave_days NUMERIC(6, 2);
