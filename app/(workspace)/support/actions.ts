'use server';
import { writeDatedRecord } from '@/app/records/actions';

import { revalidatePath } from 'next/cache';
import type { PostgrestError } from '@supabase/supabase-js';

import { getCurrentProfile } from '@/lib/auth/profile';
import {
  canCreateSupportRecord,
  canManageReportSnapshots,
  canManageSupportRecords,
  type SupportKnowledgeModule,
} from '@/lib/support/permissions';
import { createClient } from '@/lib/supabase/server';
import type { ActionResponse, ReportStatus, User } from '@/types/tracker';

type SupportActionState = ActionResponse<{ id: string }>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const KNOWLEDGE_MODULES = ['daily-facts', 'ideas', 'suggestions'] as const;

type Actor =
  | { readonly ok: true; readonly profile: User }
  | { readonly ok: false; readonly error: string };

async function resolveActor(): Promise<Actor> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'You are not signed in.' };
  if (!profile.isActive) return { ok: false, error: 'Your account is deactivated.' };
  return { ok: true, profile };
}

export async function saveKnowledgeEntryAction(form:FormData){return writeDatedRecord(form);}
export async function deleteKnowledgeEntryAction(form:FormData){form.set('command','withdraw');return writeDatedRecord(form);}
export async function toggleKnowledgeValidationAction(form:FormData){form.set('command','validate');return writeDatedRecord(form);}
export async function saveSalesLogAction(form:FormData){form.set('kind','sale');return writeDatedRecord(form);}
export async function deleteSalesLogAction(form:FormData){form.set('kind','sale');form.set('command','withdraw');return writeDatedRecord(form);}

export async function saveReportSnapshotAction(
  formData: FormData,
): Promise<SupportActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };
  if (!canManageReportSnapshots(actor.profile.role)) {
    return { success: false, error: 'Only leadership can edit reports.' };
  }

  const id = readUuid(formData, 'id');
  const title = readString(formData, 'title');
  const reportType = readString(formData, 'reportType');
  const status = readReportStatus(formData);
  if (title.length < 2 || reportType.length < 2) {
    return { success: false, error: 'Enter a report title and type.' };
  }
  if (!status) return { success: false, error: 'Select a valid report status.' };

  const payload = {
    title,
    report_type: reportType,
    status,
    period_start: readNullableDate(formData, 'periodStart'),
    period_end: readNullableDate(formData, 'periodEnd'),
    employee_id: readUuid(formData, 'employeeId'),
    payload: {
      summary: readNullableString(formData, 'summary'),
      folderUrl: readNullableString(formData, 'folderUrl'),
    },
    created_by: actor.profile.id,
  };

  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from('report_snapshots').update(payload).eq('id', id).select('id').single()
    : await supabase.from('report_snapshots').insert(payload).select('id').single();

  if (error) return { success: false, error: describeError(error) };
  revalidateSupportPaths();
  return { success: true, data: { id: data.id } };
}

export async function deleteReportSnapshotAction(
  formData: FormData,
): Promise<SupportActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };
  if (!canManageReportSnapshots(actor.profile.role)) {
    return { success: false, error: 'Only leadership can delete reports.' };
  }

  const id = readUuid(formData, 'id');
  if (!id) return { success: false, error: 'Missing report.' };

  const supabase = await createClient();
  const { error } = await supabase.from('report_snapshots').delete().eq('id', id);
  if (error) return { success: false, error: describeError(error) };

  revalidateSupportPaths();
  return { success: true, data: { id } };
}

function readKnowledgeModule(formData: FormData): SupportKnowledgeModule | null {
  const value = readString(formData, 'module');
  return (KNOWLEDGE_MODULES as readonly string[]).includes(value)
    ? (value as SupportKnowledgeModule)
    : null;
}

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function readNullableString(formData: FormData, key: string): string | null {
  const value = readString(formData, key);
  return value === '' ? null : value;
}

function readUuid(formData: FormData, key: string): string | null {
  const value = readString(formData, key);
  return UUID_PATTERN.test(value) ? value : null;
}

function readNullableDate(formData: FormData, key: string): string | null {
  const value = readString(formData, key);
  return value === '' ? null : ISO_DATE_PATTERN.test(value) ? value : null;
}

function readReportStatus(formData: FormData): ReportStatus | null {
  const value = readString(formData, 'status');
  return value === 'Draft' || value === 'Final' ? value : null;
}

function readCheckbox(formData: FormData, key: string): boolean {
  return formData.get(key) === 'on' || formData.get(key) === 'true';
}

function describeError(error: PostgrestError): string {
  if (error.code === '42501') return 'You do not have permission for that change.';
  if (error.code === '23503') return 'A linked employee no longer exists.';
  if (error.code === '23514') return 'The submitted dates are invalid.';
  return error.message;
}

function revalidateSupportPaths() {
  for (const path of [
    '/reports',
    '/daily-facts',
    '/ideas',
    '/suggestions',
    '/sales',
    '/team',
  ]) {
    revalidatePath(path);
  }
}
