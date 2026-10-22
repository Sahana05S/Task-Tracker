const MISSING_SCHEMA_PATTERNS = [
  'schema cache',
  'could not find the table',
  'could not find table',
] as const;

/** PostgREST / PostgreSQL codes for "this function does not exist" (a database before its migration). */
export function isMissingFunctionError(error: { code?: string } | null | undefined): boolean {
  return error?.code === 'PGRST202' || error?.code === '42883';
}

export function isMissingSchemaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  return MISSING_SCHEMA_PATTERNS.some((pattern) =>
    normalized.includes(pattern),
  );
}
