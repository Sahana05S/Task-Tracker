import * as React from 'react';

export interface SchemaNoticeProps {
  /** Repository-relative path of the migration that has not been applied. */
  migration: string;
}

/**
 * Shown when `/milestones` finds its tables missing.
 *
 * This replaced a thrown error. Both are loud, but a 500 also takes the route down
 * and strands the visitor there, and the thing being reported is a setup step with
 * one obvious fix — so the page stays up and names the file instead.
 *
 * Deliberately not styled as a soft empty state. "Nobody has written a vision yet"
 * and "the tables do not exist" need to look like different problems, or the second
 * gets mistaken for the first and nobody runs the migration.
 */
export function SchemaNotice({ migration }: SchemaNoticeProps) {
  return (
    <section
      aria-labelledby="schema-notice-heading"
      className="border-attention-border bg-attention-subtle text-attention-foreground rounded-2xl border p-5"
    >
      <h2
        id="schema-notice-heading"
        className="text-sm font-bold"
      >
        Migration not applied
      </h2>

      <p className="mt-1.5 max-w-2xl text-sm opacity-90">
        This page reads{' '}
        <code className="rounded border border-attention-border bg-card px-1 py-0.5 font-mono text-xs">
          company_statements
        </code>{' '}
        and{' '}
        <code className="rounded border border-attention-border bg-card px-1 py-0.5 font-mono text-xs">
          company_milestones
        </code>
        , and neither table exists in the connected Supabase project yet.
      </p>

      <ol className="mt-4 flex max-w-2xl flex-col gap-2 text-sm opacity-90">
        <li className="flex gap-2">
          <span className="font-mono text-xs font-semibold">
            1.
          </span>
          <span>
            Open the Supabase dashboard for this project and go to the{' '}
            <span className="font-medium">SQL Editor</span>.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="font-mono text-xs font-semibold">
            2.
          </span>
          <span>
            Paste the whole of{' '}
            <code className="rounded border border-attention-border bg-card px-1 py-0.5 font-mono text-xs">
              {migration}
            </code>{' '}
            and run it once. It is safe to re-run: the seed statements use{' '}
            <code className="rounded border border-attention-border bg-card px-1 py-0.5 font-mono text-xs">
              ON CONFLICT DO NOTHING
            </code>{' '}
            and the milestones only seed into an empty table.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="font-mono text-xs font-semibold">
            3.
          </span>
          <span>Reload this page.</span>
        </li>
      </ol>

      <p className="mt-4 max-w-2xl text-xs opacity-75">
        Migrations <span className="font-mono">01</span>,{' '}
        <span className="font-mono">02</span> and{' '}
        <span className="font-mono">03</span> are already applied — the rest of the
        workspace works — and <span className="font-mono">04</span> depends on all
        three, so it can be run as-is.
      </p>
    </section>
  );
}
