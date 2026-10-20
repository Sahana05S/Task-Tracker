import type { PostgrestError } from '@supabase/supabase-js';

import { readString } from '@/shared/forms/form-data';
import { createClient } from '@/shared/supabase/server';
import { mapUser, USER_COLUMNS } from '@/shared/supabase/mappers';
import { USER_ROLES } from '@/shared/tracker/enums';
import type { User, UserRole } from '@/types/tracker';

/**
 * Director people admin (migration 49). PRIVATE.
 *
 * Reads the company's members and open invitations, and runs
 * `people_command`, which is the real permission boundary: only an active
 * managing director, only inside their company, never demoting or deactivating
 * themselves, and the company always keeps an active managing director.
 */

export interface Invitation {
  id: string;
  email: string;
  fullName: string;
  employeeId: string;
  role: UserRole;
  createdAt: string;
}

export interface PeopleAdminData {
  members: User[];
  invitations: Invitation[];
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export interface InviteInput { email: string; fullName: string; employeeId: string; role: UserRole }
export interface MemberUpdateInput {
  userId: string;
  role?: UserRole;
  isActive?: boolean;
  fullName?: string;
  employeeId?: string;
}

const EMPLOYEE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readRole(value: string): UserRole | null {
  return (USER_ROLES as readonly string[]).includes(value) ? (value as UserRole) : null;
}

export function parseInvite(form: FormData): Parsed<InviteInput> {
  const email = readString(form, 'email').toLowerCase();
  const fullName = readString(form, 'fullName');
  const employeeId = readString(form, 'employeeId');
  const role = readRole(readString(form, 'role') || 'team_member');
  if (!EMAIL.test(email)) return { ok: false, error: 'Enter a valid email address.' };
  if (!fullName || fullName.length > 120) return { ok: false, error: 'Enter a name of up to 120 characters.' };
  if (!EMPLOYEE_ID.test(employeeId)) return { ok: false, error: 'Employee ID may use letters, digits, - and _ (up to 40).' };
  if (!role) return { ok: false, error: 'Choose a role.' };
  return { ok: true, value: { email, fullName, employeeId, role } };
}

export function parseMemberUpdate(form: FormData): Parsed<MemberUpdateInput> {
  const userId = readString(form, 'userId');
  if (!UUID.test(userId)) return { ok: false, error: 'Member not found.' };
  const value: MemberUpdateInput = { userId };
  const role = readString(form, 'role');
  if (role) {
    const parsed = readRole(role);
    if (!parsed) return { ok: false, error: 'Choose a role.' };
    value.role = parsed;
  }
  const active = readString(form, 'isActive');
  if (active === 'true' || active === 'false') value.isActive = active === 'true';
  const fullName = readString(form, 'fullName');
  if (fullName) {
    if (fullName.length > 120) return { ok: false, error: 'Enter a name of up to 120 characters.' };
    value.fullName = fullName;
  }
  const employeeId = readString(form, 'employeeId');
  if (employeeId) {
    if (!EMPLOYEE_ID.test(employeeId)) return { ok: false, error: 'Employee ID may use letters, digits, - and _ (up to 40).' };
    value.employeeId = employeeId;
  }
  return { ok: true, value };
}

export function parseInvitationId(form: FormData): Parsed<string> {
  const id = readString(form, 'invitationId');
  return UUID.test(id) ? { ok: true, value: id } : { ok: false, error: 'Invitation not found.' };
}

/** Members (active and inactive) and open invitations of the director's company. */
export async function readPeopleAdminData(): Promise<PeopleAdminData> {
  const supabase = await createClient();
  const [members, invitations] = await Promise.all([
    supabase.from('users').select(USER_COLUMNS).order('is_active', { ascending: false }).order('full_name'),
    supabase
      .from('member_invitations')
      .select('id, email, full_name, employee_id, role, created_at')
      .is('accepted_at', null)
      .is('revoked_at', null)
      .order('created_at', { ascending: false }),
  ]);
  if (members.error) throw new Error(`People could not be loaded: ${members.error.message}`);
  if (invitations.error) throw new Error(`Invitations could not be loaded: ${invitations.error.message}`);
  return {
    members: members.data.map(mapUser),
    invitations: invitations.data.map((row) => ({
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      employeeId: row.employee_id,
      role: row.role,
      createdAt: row.created_at,
    })),
  };
}

function describe(error: PostgrestError): string {
  // The command raises plain-language messages; show them, not codes.
  if (error.code === '42501' || error.code === '23505' || error.code === '23514') return error.message;
  return `The change was not saved: ${error.message}`;
}

/** Runs one people command; returns an error message, or null on success. */
export async function runPeopleCommand(
  command: 'invite' | 'revoke' | 'update',
  payload: Record<string, string | boolean>,
): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('people_command', { p_command: command, p_payload: payload });
  return error ? describe(error) : null;
}
