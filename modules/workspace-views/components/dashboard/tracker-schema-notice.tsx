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
        Team analytics isn’t set up yet
      </h2>

      <p className="mt-1.5 max-w-3xl text-sm opacity-90">
        This workspace’s database is missing the tables analytics reads. Ask your
        managing director to finish the setup; your saved work is not affected.
      </p>

      <p className="mt-2 max-w-3xl text-xs opacity-75">
        For whoever manages the database: migrations are applied only by the
        “Apply migrations to the demo database” GitHub workflow when they merge to main. Check its
        latest run; a failed run means the site is ahead of its database.
      </p>
    </section>
  );
}
