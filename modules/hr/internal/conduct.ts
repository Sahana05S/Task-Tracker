import 'server-only';

import { isConflictCode } from '@/shared/commands/conflict';
import { createClient } from '@/shared/supabase/server';
import { isMissingFunctionError } from '@/shared/supabase/schema-errors';

/**
 * Code of Conduct reads and commands (migration 80). PRIVATE.
 * `code_of_conduct_command` is the permission boundary: any active member
 * accepts, only the managing director publishes.
 */

export interface ConductVersion {
  id: string;
  version: number;
  title: string;
  body: string;
  publishedAt: string;
}

export interface ConductAcknowledgement {
  userId: string;
  employeeId: string;
  fullName: string;
  acknowledgedAt: string | null;
}

export interface CodeOfConduct {
  current: ConductVersion | null;
  /** When the signed-in member accepted the current version. */
  acknowledgedAt: string | null;
  /** Managing director only: every active member and whether they accepted it. */
  acknowledgements: ConductAcknowledgement[] | null;
}

type Row = Record<string, unknown>;
const object = (value: unknown): Row => (typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Row : {});
const optional = (value: unknown) => (typeof value === 'string' ? value : null);

function mapConduct(data: unknown): CodeOfConduct {
  const value = object(data);
  const current = value.current ? object(value.current) : null;
  return {
    current: current ? {
      id: String(current.id), version: Number(current.version), title: String(current.title ?? ''),
      body: String(current.body ?? ''), publishedAt: String(current.publishedAt ?? ''),
    } : null,
    acknowledgedAt: optional(value.acknowledgedAt),
    acknowledgements: Array.isArray(value.acknowledgements)
      ? value.acknowledgements.map(object).map(row => ({
        userId: String(row.userId), employeeId: String(row.employeeId ?? ''), fullName: String(row.fullName ?? ''),
        acknowledgedAt: optional(row.acknowledgedAt),
      }))
      : null,
  };
}

/** The current Code of Conduct; null before migration 80. */
export async function readCodeOfConduct(): Promise<CodeOfConduct | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('code_of_conduct');
  if (error) {
    if (isMissingFunctionError(error)) return null;
    throw new Error(`The Code of Conduct could not be loaded: ${error.message}`);
  }
  return mapConduct(data);
}

export type ConductResult = { ok: true; version: number } | { ok: false; error: string };

export async function runConductCommand(input: {
  op: 'publish' | 'acknowledge'; title: string | null; body: string | null; version: number; operationId: string;
}): Promise<ConductResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('code_of_conduct_command', {
    p_op: input.op, p_title: input.title, p_body: input.body, p_version: input.version, p_operation: input.operationId,
  });
  if (error) {
    if (isConflictCode(error.code)) return { ok: false, error: 'The Code of Conduct was changed meanwhile. Reload the page and try again.' };
    if (isMissingFunctionError(error)) return { ok: false, error: 'The Code of Conduct needs the latest database update (migration 80).' };
    if (['42501', '23514', 'P0002'].includes(error.code ?? '')) return { ok: false, error: error.message };
    return { ok: false, error: `The change was not saved: ${error.message}` };
  }
  return { ok: true, version: Number(object(data).version) };
}
