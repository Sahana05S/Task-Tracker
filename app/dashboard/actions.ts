'use server';

import type { ActionResponse } from '@/types/tracker';

export interface SnapshotSummary {periodLabel:string;memberCount:number;starPerformer:string|null}

/** Retained only so old clients cannot reach the former overwriteable upsert. */
export async function freezeMonthlySnapshot(_year?:number,_month?:number): Promise<ActionResponse<SnapshotSummary>> {
  return { success: false, error: 'The old Freeze action is retired. Use the versioned month archive controls in Reports.' };
}
