const MISSING_SCHEMA_PATTERNS = [
  'schema cache',
  'could not find the table',
  'could not find table',
] as const;

export function isMissingSchemaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  return MISSING_SCHEMA_PATTERNS.some((pattern) =>
    normalized.includes(pattern),
  );
}
