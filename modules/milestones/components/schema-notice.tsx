

export interface SchemaNoticeProps {
  /** Repository-relative path of the migration that has not been applied. */
  migration: string;
}

/**
 * Shown when `/milestones` finds its tables missing.
 *
 * This replaced a thrown error. Both are loud, but a 500 also takes the route down
 * and strands the visitor there, and the thing being reported is a setup step with
 * one obvious cause — so the page stays up and names the file instead.
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
        Vision and milestones aren’t set up yet
      </h2>

      <p className="mt-1.5 max-w-2xl text-sm opacity-90">
        This workspace’s database is missing the tables this page reads. Ask your
        managing director to finish the setup.
      </p>

      <p className="mt-2 max-w-2xl text-xs opacity-75">
        For whoever manages the database: <span className="font-mono">{migration}</span> has
        not reached it. Migrations are applied only by the “Apply migrations to the demo database”
        GitHub workflow when they merge to main; check its latest run.
      </p>
    </section>
  );
}
