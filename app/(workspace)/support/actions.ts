'use server';

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

export async function saveKnowledgeEntryAction(
  formData: FormData,
): Promise<SupportActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };

  const module = readKnowledgeModule(formData);
  if (!module) return { success: false, error: 'Unknown support module.' };

  const canManage = canManageSupportRecords(actor.profile.role);
  const id = readUuid(formData, 'id');
  if (id && !canManage) {
    return { success: false, error: 'Only managers can edit records.' };
  }
  if (!id && !canCreateSupportRecord(actor.profile)) {
    return { success: false, error: 'You cannot create records.' };
  }

  const entryDate = readString(formData, 'entryDate');
  const body = readString(formData, 'body');
  if (!ISO_DATE_PATTERN.test(entryDate)) {
    return { success: false, error: 'Enter a valid date.' };
  }
  if (body.length < 2) {
    return { success: false, error: 'Enter the record text.' };
  }

  const postedBy = canManage
    ? (readUuid(formData, 'postedBy') ?? actor.profile.id)
    : actor.profile.id;
  const folderUrl = readNullableString(formData, 'folderUrl');
  const supabase = await createClient();
  const payload = knowledgePayload(module, {
    entryDate,
    postedBy,
    body,
    folderUrl,
  });

  const result = id
    ? await updateKnowledgeEntry(supabase, module, id, payload)
    : await insertKnowledgeEntry(supabase, module, payload);

  if (result.error) return { success: false, error: describeError(result.error) };

  revalidateSupportPaths();
  return { success: true, data: { id: result.id } };
}

export async function deleteKnowledgeEntryAction(
  formData: FormData,
): Promise<SupportActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };
  if (!canManageSupportRecords(actor.profile.role)) {
    return { success: false, error: 'Only managers can delete records.' };
  }

  const module = readKnowledgeModule(formData);
  const id = readUuid(formData, 'id');
  if (!module || !id) return { success: false, error: 'Missing record.' };

  const supabase = await createClient();
  const error = await deleteKnowledgeEntry(supabase, module, id);
  if (error) return { success: false, error: describeError(error) };

  revalidateSupportPaths();
  return { success: true, data: { id } };
}

export async function toggleKnowledgeValidationAction(
  formData: FormData,
): Promise<SupportActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };
  if (!canManageSupportRecords(actor.profile.role)) {
    return { success: false, error: 'Only managers can validate records.' };
  }

  const module = readKnowledgeModule(formData);
  const id = readUuid(formData, 'id');
  if (!module || !id) return { success: false, error: 'Missing record.' };

  const isValidated = readString(formData, 'isValidated') === 'true';
  const supabase = await createClient();
  const error = await updateKnowledgeEntry(supabase, module, id, {
    is_validated: isValidated,
    validated_by: isValidated ? actor.profile.id : null,
  }).then((result) => result.error);

  if (error) return { success: false, error: describeError(error) };

  revalidateSupportPaths();
  return { success: true, data: { id } };
}

export async function saveSalesLogAction(
  formData: FormData,
): Promise<SupportActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };

  const canManage = canManageSupportRecords(actor.profile.role);
  const id = readUuid(formData, 'id');
  if (id && !canManage) {
    return { success: false, error: 'Only managers can edit sales logs.' };
  }
  if (!id && !canCreateSupportRecord(actor.profile)) {
    return { success: false, error: 'You cannot create sales logs.' };
  }

  const saleDate = readString(formData, 'saleDate');
  if (!ISO_DATE_PATTERN.test(saleDate)) {
    return { success: false, error: 'Enter a valid sale date.' };
  }

  const supabase = await createClient();
  const payload = {
    sale_date: saleDate,
    sales_by: canManage
      ? (readUuid(formData, 'salesBy') ?? actor.profile.id)
      : actor.profile.id,
    project_built_up_area: readNullableString(formData, 'projectBuiltUpArea'),
    project_location: readNullableString(formData, 'projectLocation'),
    client_name: readNullableString(formData, 'clientName'),
    project_folder_url: readNullableString(formData, 'projectFolderUrl'),
    is_new_project: readCheckbox(formData, 'isNewProject'),
    basement_payment_received: readCheckbox(formData, 'basementPaymentReceived'),
    notes: readNullableString(formData, 'notes'),
  };

  const { data, error } = id
    ? await supabase.from('sales_logs').update(payload).eq('id', id).select('id').single()
    : await supabase.from('sales_logs').insert(payload).select('id').single();

  if (error) return { success: false, error: describeError(error) };
  revalidateSupportPaths();
  return { success: true, data: { id: data.id } };
}

export async function deleteSalesLogAction(
  formData: FormData,
): Promise<SupportActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };
  if (!canManageSupportRecords(actor.profile.role)) {
    return { success: false, error: 'Only managers can delete sales logs.' };
  }

  const id = readUuid(formData, 'id');
  if (!id) return { success: false, error: 'Missing sales log.' };

  const supabase = await createClient();
  const { error } = await supabase.from('sales_logs').delete().eq('id', id);
  if (error) return { success: false, error: describeError(error) };

  revalidateSupportPaths();
  return { success: true, data: { id } };
}

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

function knowledgePayload(
  module: SupportKnowledgeModule,
  input: {
    entryDate: string;
    postedBy: string;
    body: string;
    folderUrl: string | null;
  },
) {
  switch (module) {
    case 'daily-facts':
      return {
        fact_date: input.entryDate,
        posted_by: input.postedBy,
        fact: input.body,
        folder_url: input.folderUrl,
      };
    case 'ideas':
      return {
        idea_date: input.entryDate,
        posted_by: input.postedBy,
        idea: input.body,
        folder_url: input.folderUrl,
      };
    case 'suggestions':
      return {
        suggestion_date: input.entryDate,
        posted_by: input.postedBy,
        suggestion: input.body,
        folder_url: input.folderUrl,
      };
  }
}

async function insertKnowledgeEntry(
  supabase: Awaited<ReturnType<typeof createClient>>,
  module: SupportKnowledgeModule,
  payload: ReturnType<typeof knowledgePayload>,
): Promise<{ id: string; error: PostgrestError | null }> {
  switch (module) {
    case 'daily-facts': {
      const { data, error } = await supabase
        .from('daily_facts')
        .insert(payload as never)
        .select('id')
        .single();
      return { id: data?.id ?? '', error };
    }
    case 'ideas': {
      const { data, error } = await supabase
        .from('ideas')
        .insert(payload as never)
        .select('id')
        .single();
      return { id: data?.id ?? '', error };
    }
    case 'suggestions': {
      const { data, error } = await supabase
        .from('suggestions')
        .insert(payload as never)
        .select('id')
        .single();
      return { id: data?.id ?? '', error };
    }
  }
}

async function updateKnowledgeEntry(
  supabase: Awaited<ReturnType<typeof createClient>>,
  module: SupportKnowledgeModule,
  id: string,
  payload: Record<string, unknown>,
): Promise<{ id: string; error: PostgrestError | null }> {
  switch (module) {
    case 'daily-facts': {
      const { data, error } = await supabase
        .from('daily_facts')
        .update(payload as never)
        .eq('id', id)
        .select('id')
        .single();
      return { id: data?.id ?? id, error };
    }
    case 'ideas': {
      const { data, error } = await supabase
        .from('ideas')
        .update(payload as never)
        .eq('id', id)
        .select('id')
        .single();
      return { id: data?.id ?? id, error };
    }
    case 'suggestions': {
      const { data, error } = await supabase
        .from('suggestions')
        .update(payload as never)
        .eq('id', id)
        .select('id')
        .single();
      return { id: data?.id ?? id, error };
    }
  }
}

async function deleteKnowledgeEntry(
  supabase: Awaited<ReturnType<typeof createClient>>,
  module: SupportKnowledgeModule,
  id: string,
): Promise<PostgrestError | null> {
  switch (module) {
    case 'daily-facts': {
      const { error } = await supabase.from('daily_facts').delete().eq('id', id);
      return error;
    }
    case 'ideas': {
      const { error } = await supabase.from('ideas').delete().eq('id', id);
      return error;
    }
    case 'suggestions': {
      const { error } = await supabase.from('suggestions').delete().eq('id', id);
      return error;
    }
  }
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
