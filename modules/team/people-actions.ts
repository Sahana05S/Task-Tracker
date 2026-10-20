'use server';

import { revalidatePath } from 'next/cache';

import {
  parseInvitationId,
  parseInvite,
  parseMemberUpdate,
  runPeopleCommand,
} from '@/modules/team/internal/people';
import { resolveActor } from '@/shared/session/actor';
import type { ActionResponse } from '@/types/tracker';

/**
 * PUBLIC Server Actions for the director's People page. The role check here
 * only gives a friendly message; `people_command` enforces it in the database.
 */

export type PeopleActionState = ActionResponse<{ message: string }>;

const NOT_DIRECTOR = 'Only a managing director can manage people.';

async function directorOnly(): Promise<string | null> {
  const actor = await resolveActor();
  if (!actor.ok) return actor.error;
  return actor.profile.role === 'managing_director' ? null : NOT_DIRECTOR;
}

function refresh(): void {
  // Names, roles and active state appear across the whole workspace.
  revalidatePath('/', 'layout');
}

/** Invites a person by email with their name, employee ID and role. */
export async function inviteMember(_prev: PeopleActionState | null, form: FormData): Promise<PeopleActionState> {
  const denied = await directorOnly();
  if (denied) return { success: false, error: denied };
  const input = parseInvite(form);
  if (!input.ok) return { success: false, error: input.error };
  const error = await runPeopleCommand('invite', { ...input.value });
  if (error) return { success: false, error };
  refresh();
  return {
    success: true,
    data: { message: `Invited ${input.value.email}. Ask them to open the sign-in page, choose “Accept invitation” and use this email (or Google with the same address).` },
  };
}

/** Withdraws an open invitation. */
export async function revokeInvitation(_prev: PeopleActionState | null, form: FormData): Promise<PeopleActionState> {
  const denied = await directorOnly();
  if (denied) return { success: false, error: denied };
  const id = parseInvitationId(form);
  if (!id.ok) return { success: false, error: id.error };
  const error = await runPeopleCommand('revoke', { invitationId: id.value });
  if (error) return { success: false, error };
  refresh();
  return { success: true, data: { message: 'Invitation withdrawn.' } };
}

/** Changes a member's role, name, employee ID or active state. */
export async function updateMember(_prev: PeopleActionState | null, form: FormData): Promise<PeopleActionState> {
  const denied = await directorOnly();
  if (denied) return { success: false, error: denied };
  const input = parseMemberUpdate(form);
  if (!input.ok) return { success: false, error: input.error };
  const error = await runPeopleCommand('update', { ...input.value });
  if (error) return { success: false, error };
  refresh();
  const message =
    input.value.isActive === false ? 'Access removed. Their records stay in reports.'
    : input.value.isActive === true ? 'Access restored.'
    : 'Saved.';
  return { success: true, data: { message } };
}
