// PUBLIC server-side API of the scoring module. Server code imports from here;
// 'use client' components and pure helpers import '@/modules/scoring/client'.

export * from '@/modules/scoring/client';

export { loadPerformance } from '@/modules/scoring/internal/performance/queries';
export { runPerformanceJobs } from '@/modules/scoring/internal/performance/jobs';
export { getAwards } from '@/modules/scoring/internal/stars/read-model';
export { calculateAward } from '@/modules/scoring/internal/stars/calculation';
export { runAwardJobs } from '@/modules/scoring/internal/stars/jobs';
export { handleAwardWorkerRun } from '@/modules/scoring/internal/stars/worker';
export { getTeamSummaryInputs, parseTeamSummary } from '@/modules/scoring/internal/analytics/summary-inputs';
