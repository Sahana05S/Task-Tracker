const REQUIRED_MIGRATIONS = [
  'supabase/migrations/07_tracker_replacement_foundation.sql',
  'supabase/migrations/08_checklist_progress_sync.sql',
  'supabase/migrations/09_attendance_snapshot_totals.sql',
] as const;

export function TrackerSchemaNotice() {
  return (
    <section
      aria-labelledby="tracker-schema-notice-heading"
      className="border-attention-border bg-attention-subtle text-attention-foreground rounded-2xl border p-5"
    >
      <h2
        id="tracker-schema-notice-heading"
        className="text-sm font-bold"
      >
        Tracker replacement migrations are missing
      </h2>

      <p className="mt-1.5 max-w-3xl text-sm opacity-90">
        The dashboard is connected to a Supabase project that does not have the
        replacement tracker tables yet, such as{' '}
        <code className="rounded border border-attention-border bg-card px-1 py-0.5 font-mono text-xs">
          public.task_assignees
        </code>
        . Apply the remaining migrations to this same project, then reload the
        app.
      </p>

      <ol className="mt-4 flex max-w-3xl flex-col gap-2 text-sm opacity-90">
        <li className="flex gap-2">
          <span className="font-mono text-xs font-semibold">
            1.
          </span>
          <span>
            Open Supabase Dashboard → SQL Editor for the project in{' '}
            <code className="rounded border border-attention-border bg-card px-1 py-0.5 font-mono text-xs">
              .env.local
            </code>
            .
          </span>
        </li>
        <li className="flex gap-2">
          <span className="font-mono text-xs font-semibold">
            2.
          </span>
          <span>
            Run these migrations in order:{' '}
            {REQUIRED_MIGRATIONS.map((migration, index) => (
              <code
                key={migration}
                className="mr-1 rounded border border-attention-border bg-card px-1 py-0.5 font-mono text-xs"
              >
                {index + 7}: {migration}
              </code>
            ))}
          </span>
        </li>
        <li className="flex gap-2">
          <span className="font-mono text-xs font-semibold">
            3.
          </span>
          <span>
            Run{' '}
            <code className="rounded border border-attention-border bg-card px-1 py-0.5 font-mono text-xs">
              NOTIFY pgrst, &apos;reload schema&apos;;
            </code>{' '}
            and restart{' '}
            <code className="rounded border border-attention-border bg-card px-1 py-0.5 font-mono text-xs">
              npm run dev
            </code>
            .
          </span>
        </li>
      </ol>
    </section>
  );
}
