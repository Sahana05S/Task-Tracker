# Staged release runbook — prepared 13 October 2026

## M13 hosted rehearsal update — 15 October 2026

The named disposable test project has local migrations 01–29 and synthetic
native/browser acceptance evidence in [M13-evidence](M13-evidence.md). Do not
reset that project to rehearse a predecessor upgrade. The original project,
production and Drive provider remain out of scope. A separate local PG18 clone
restored 68 captured test application tables, but a PG17→PG18 timer numeric
CHECK required a local-only tolerance adjustment; no hosted schema or migration
was modified. CLI `db dump` could not run without Docker. This clone is not a
full Supabase Auth/config/Storage backup or PITR. Obtain a separately identified
hosted predecessor or approved preview branch before the hosted 01–28→29
upgrade/restore gate can pass; compare actual schema, grants and row digests.

Core sandbox worker tests use only ephemeral child-process flags/tokens. The
permanent award schedule and Drive worker remain disabled. A missing-sales day
must retain `blocked`/`incomplete`, no certified score and no winner; a failed
lease requires a safe retry and a zero-outcome replay. See M13 evidence for
the exact delivered result and outstanding UI/recovery limits. Freeze an
immutable candidate commit and record its hash only after focused, full,
typecheck and build checks pass; a local build alone is not a deployment.

**Stop line:** this is preparation, not authorization to deploy, run migrations
on production, seed production data or enable workers. The exact app artifact
cannot be named yet: current `main` is `7764489ac6bcc13f0062e67b401c7c9738f5848b`
with uncommitted M01–M13 work. Create and verify an immutable release commit
before any staging/prod comparison. The latest local migration is
`29_month_archive_and_revisions.sql` (SHA-256
`59B9CA142E0FB3C480090C2E623F7E7EC5EB6557FC4B63F82E704BF5064C58D8`).
Never replay an already-applied migration merely because it exists locally.

## 1. Stage and identify the destination

1. Identify an isolated native Supabase project by project ref, database host,
   project owner, API URL, applied migration ledger and sample row counts. Confirm
   explicitly that it is non-production before connecting or seeding. The
   currently linked project in local Supabase CLI metadata is **unclassified**;
   do not use it for rehearsal without that confirmation.
2. Record the exact release commit, artifact/build ID, Node version, PostgreSQL
   version, and migration checksums 01–29. Compare the destination's applied
   migration names/checksums and actual schema to the expected predecessor.
   Resolve drift individually; do not overwrite applied SQL files or assume
   the target is at 28.
3. Provision test-only users/roles and non-private fixture rows from
   [RELEASE-READINESS](RELEASE-READINESS.md). Keep production credentials and
   service-role keys in server secret storage, never in the repository/client.
   Required configuration includes `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` for server
   workers, and `TASKPULSE_AWARD_WORKER_TOKEN` only when a sandbox worker is
   intentionally tested. Drive worker/token/service-account configuration stays
   absent/disabled under the user's deferral.

For the smallest local native test environment on this Windows workstation,
start Docker Desktop's Linux engine and wait until `docker info` reports a
server. Then, from this repository, run `supabase start` and `supabase status`.
Verify the reported API and database hosts are loopback/local and identify the
containers as disposable **before** any reset. On that confirmed local-only
stack, `supabase db reset --local --no-seed` applies the numbered migrations;
never use `--linked`, `--project-ref` or `--db-url` for this rehearsal. Point a
test-only `.env.local` at the local API/anon values reported by `supabase status`,
create only synthetic Auth users, and seed the
[M13 scenario](fixtures/m13-native-scenario.json). The engine is currently
unavailable, so none of these native steps was run. An explicitly identified
non-production hosted project is another option, but its identity and applied
migration ledger must be reviewed before any write.

## 2. Back up, reconcile and migrate in staging

1. Take a consistent logical backup and verify that the archive file is
   nonempty and restorable to a **different disposable database**. Capture
   database version, schema/role/grant list, row counts and checksum/manifest
   for users, tasks, participants/shares, checklists, logs, timer links,
   attendance, support/reviews, award runs, reports and both legacy snapshot
   tables. Preserve backup location and restore owner in the release record.
2. Dry-run source reconciliation: flag duplicate timer-log links, orphaned
   references, unclassified old statuses, legacy scales/shares without dated
   versions, missing attendance/history and unproven sales subtotals. Retain
   exception IDs/counts; never auto-delete or infer missing attribution. Check
   that historical snapshots retain their old rule labels and values.
3. On a clean disposable database apply 01–29 in numeric order. On a copied
   representative predecessor apply **only missing** forward migrations in
   order after comparing its ledger. The local harness proves fresh 01–29 and
   upgrade 01–28→29 with synthetic records, but production predecessor and
   native grants are unknown. Reconcile pre/post row counts, foreign keys,
   exception lists, generated scale/credit versions and old archive hashes.
4. Deploy the compatible application build only after staging schema and app
   command contracts are both verified. Keep old clients/workers quiet across
   incompatible command windows. Test the exact bundled artifact against the
   staging migration state; record its commit and build ID. A build passing
   against local `.env.local` does not prove staging configuration.

## 3. Acceptance gates before production authorization

- Run CI unit/type/build and disposable PostgreSQL checks. The new workflow
  covers these layers, **not** native auth or browser acceptance. Record CI run
  URL and exact commit; a skipped/unavailable job is a failed gate.
- Use real test accounts/tokens with Supabase Auth/PostgREST and the app API.
  Confirm allowed commands and direct denials for protected columns,
  cross-task checklist moves, inactive/anonymous writes, forged IDs,
  self-validation, self-role escalation, scoped report/export reads and
  director-only overrides/close/corrections.
- Execute the complete seeded browser journey in the pasted M13 request at
  desktop/mobile widths, including keyboard and error/retry paths. Compare
  dashboard, profile, award and export outputs for the same period/as-of.
  Confirm public landing, settings, milestones, filters and unaffected routes.
- Exercise the award worker from an actual sandbox schedule/request through
  leased job delivery, replay, failure/retry and last-success monitoring.
  Keep production schedules off. A complete certified synthetic path is a
  technical acceptance gate; it does not resolve real BN/BO/BP source mapping.
- Require approved business mapping and historical provenance before enabling
  complete scoring/ranking/certified awards for real records. Incomplete months
  may close only as clearly non-certified archives with reasons and no winner.
  If core operations release is separately considered, verify these unavailable
  and non-certified states end to end and explicitly exclude certification.

## 4. Production sequence after separate authorization

1. Freeze the approved release commit/artifact and target migration list.
   Re-identify the production project and applied ledger immediately before
   action. Take and restore-check a current backup; compare preflight counts
   and exceptions with staging. Stop on unexplained differences.
2. Apply only reviewed, missing forward migrations; record each checksum and
   result. Run schema/grant/row-count checks. Deploy the tested compatible app
   artifact and record its deployed revision. Do **not** enable Drive or award
   schedules as part of schema migration.
3. Smoke test real role access and one harmless synthetic/current-period native
   task journey, manual link, checklist, log, attendance, scoped report/export,
   archive read and error/Unavailable display. Check public landing and
   unaffected routes. Avoid altering historical real records for smoke tests.
4. Enable any approved worker separately after its token, service role,
   schedule timezone, lease/replay/monitoring and source-completeness gates pass.
   Confirm a delivered job and a repeat safely return one effective result.
   Drive remains disabled until the user explicitly resumes its sandbox track.

## 5. Monitoring and recovery

Monitor failed/leased/stale outbox jobs, source invalidation backlog, missing
factor reasons, attendance invalidity, daily run completeness, award overrides,
report revision counts, archive certification, API permission errors and
app/database revision mismatch. Assign an operator to investigate each failed
job before replay. Never replace unavailable values with zero or rerun a closed
period as an ordinary open calculation.

Application rollback may restore a prior **compatible** artifact after checking
its command/schema assumptions. Database recovery is separate: preserve the
forward migration state and use a reviewed forward fix or restore a verified
backup into a new environment, then reconcile post-backup writes. Do not assume
29 can be reversed safely after archives/corrections exist. Retained M12
revisions provide a read selection and audited correction path, not a schema
rollback. The M13 disposable `pg_dump -Fc`/`pg_restore` rehearsal compared nine
table digests and four retained revisions; it does not prove a production RPO,
PITR process or live-traffic recovery.

## Explicit exclusions

Real Drive create/copy/rename/shortcut/share and provider jobs; historical
workbook import; unproven source-handler parity; retrospective attribution from
legacy records; certified scores/awards from missing BN/BO/BP or history; and
production migrations/deployment/worker activation under this M13 request.
