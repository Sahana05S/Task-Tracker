-- M10 follow-up: enforce the user's sole approved sandbox and manual-only phase.
-- No policy, credentials, actor mapping or worker is activated by this migration.
BEGIN;
ALTER TABLE taskpulse_private.drive_configuration ADD CONSTRAINT m10_approved_sandbox_only
 CHECK(policy IS NULL OR coalesce(
  policy @> '{"id":"m10-approved-sandbox-2026-10-13","sandbox":true,"auth":"shared_drive_service_account","scope":"drive","rootId":"13G0w_T5i6cKUMiREETYlpH9Z_3G-RyGH","employeeName":"[Employee ID]","taskName":"[Task Tag] - [Task Title]","roleFolders":{"input":["Input"],"process":["Process"],"output":["Output"]},"templates":{},"initializeTemplates":[],"blankKinds":["document","sheet","slides"],"autoInitialize":false,"checklistAuthority":"native","reviewerSharing":"commenter_files"}'::jsonb
  AND policy->'roleFolders'='{"input":["Input"],"process":["Process"],"output":["Output"]}'::jsonb
  AND policy->'templates'='{}'::jsonb
  AND policy->'initializeTemplates'='[]'::jsonb
  AND policy->'blankKinds'='["document","sheet","slides"]'::jsonb,false));
COMMENT ON CONSTRAINT m10_approved_sandbox_only ON taskpulse_private.drive_configuration IS
 'User-approved root, Shared Drive service identity, no templates, native authority, mapped commenters, manual initialization; automatic activation needs verified sandbox evidence and an accepted forward change.';
COMMIT;
