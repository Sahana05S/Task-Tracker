// PRIVATE. One evaluation pass, shared by the nightly worker and "Evaluate
// now": facts are read once per period range, every due policy period is
// evaluated by evaluatePolicy, and results are recorded in batches. Any error
// becomes a failed run (record_failure), never a silent zero.
import { policyCommand } from './commands';
import { evaluatePolicy } from './evaluate';
import { readFacts, type Db, type DueItem } from './queries';
import type { FactsModel, Period } from './types';

export type RunTrigger = 'nightly' | 'on_demand' | 'invalidation';

export interface RunSummary {
  status: 'completed' | 'failed';
  periods: number;
  evaluated: number;
  changed: number;
  notified: number;
  runIds: string[];
  errorCode?: string;
}

interface RecordResponse { runId: string; evaluated: number; changed: number; notified: number }

const BATCH = 50;

function failureCode(stage: 'facts' | 'evaluate' | 'record'): string {
  return { facts: 'facts_read_failed', evaluate: 'evaluation_failed', record: 'record_failed' }[stage];
}

export async function runDueItems(db: Db, items: DueItem[], trigger: RunTrigger): Promise<RunSummary> {
  const summary: RunSummary = { status: 'completed', periods: 0, evaluated: 0, changed: 0, notified: 0, runIds: [] };
  if (!items.length) return summary;
  let stage: 'facts' | 'evaluate' | 'record' = 'facts';
  try {
    const facts = new Map<string, FactsModel>();
    for (const item of items) {
      const range = `${item.periodStart}/${item.periodEnd}`;
      if (!facts.has(range)) facts.set(range, await readFacts(db, item.periodStart, item.periodEnd));
    }
    stage = 'evaluate';
    const records = items.map((item) => {
      const model = facts.get(`${item.periodStart}/${item.periodEnd}`)!;
      const period: Period = { kind: item.periodKind, key: item.periodKey, start: item.periodStart, end: item.periodEnd };
      const result = evaluatePolicy(item.definition, period, model);
      return {
        policyId: item.policyId, policyVersion: item.policyVersion, periodKey: item.periodKey, periodStart: item.periodStart,
        periodEnd: item.periodEnd, final: result.final, factsAt: model.readAt,
        evaluations: result.evaluations.map(({ employeeId, outcome, reasons, evidence }) => ({ employeeId, outcome, reasons, evidence })),
      };
    });
    stage = 'record';
    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH);
      const response = await policyCommand<RecordResponse>(db, 'record_run', { trigger, items: batch }, crypto.randomUUID());
      summary.periods += batch.length;
      summary.evaluated += response.evaluated;
      summary.changed += response.changed;
      summary.notified += response.notified;
      summary.runIds.push(response.runId);
    }
    return summary;
  } catch (error) {
    const errorCode = failureCode(stage);
    const detail = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    const failed = await policyCommand<{ runId: string }>(db, 'record_failure', {
      trigger, errorCode, errorDetail: detail,
      periods: items.slice(0, 20).map((item) => ({ policyId: item.policyId, periodKey: item.periodKey })),
    }, crypto.randomUUID());
    return { ...summary, status: 'failed', errorCode, runIds: [...summary.runIds, failed.runId] };
  }
}
