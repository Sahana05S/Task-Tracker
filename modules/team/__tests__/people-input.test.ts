import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/supabase/server', () => ({ createClient: vi.fn() }));

import { parseInvitationId, parseInvite, parseMemberUpdate } from '../internal/people';

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('parseInvite', () => {
  const valid = { email: ' New.Person@Example.com ', fullName: ' New Person ', employeeId: 'SAH-011', role: 'project_engineer' };

  it('normalises the email and keeps the chosen role', () => {
    expect(parseInvite(form(valid))).toEqual({
      ok: true,
      value: { email: 'new.person@example.com', fullName: 'New Person', employeeId: 'SAH-011', role: 'project_engineer' },
    });
  });

  it('defaults to team member and refuses unknown roles', () => {
    expect(parseInvite(form({ ...valid, role: '' }))).toMatchObject({ ok: true, value: { role: 'team_member' } });
    expect(parseInvite(form({ ...valid, role: 'owner' }))).toEqual({ ok: false, error: 'Choose a role.' });
  });

  it('checks email, name and employee ID', () => {
    expect(parseInvite(form({ ...valid, email: 'nope' }))).toEqual({ ok: false, error: 'Enter a valid email address.' });
    expect(parseInvite(form({ ...valid, fullName: '' }))).toEqual({ ok: false, error: 'Enter a name of up to 120 characters.' });
    expect(parseInvite(form({ ...valid, employeeId: 'has space' }))).toMatchObject({ ok: false });
    expect(parseInvite(form({ ...valid, employeeId: '-lead' }))).toMatchObject({ ok: false });
  });
});

describe('parseMemberUpdate', () => {
  it('sends only the fields present', () => {
    expect(parseMemberUpdate(form({ userId: ID, isActive: 'false' }))).toEqual({ ok: true, value: { userId: ID, isActive: false } });
    expect(parseMemberUpdate(form({ userId: ID, role: 'data_manager', fullName: 'A', employeeId: 'E-1' }))).toEqual({
      ok: true,
      value: { userId: ID, role: 'data_manager', fullName: 'A', employeeId: 'E-1' },
    });
  });

  it('refuses a bad member id or role', () => {
    expect(parseMemberUpdate(form({ userId: 'x' }))).toEqual({ ok: false, error: 'Member not found.' });
    expect(parseMemberUpdate(form({ userId: ID, role: 'root' }))).toEqual({ ok: false, error: 'Choose a role.' });
  });

  it('reads org chart placement: a present field sets it, blank clears it', () => {
    const manager = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
    expect(parseMemberUpdate(form({ userId: ID, reportsTo: manager, jobTitle: ' Site engineer ', departmentId: manager }))).toEqual({
      ok: true,
      value: { userId: ID, reportsTo: manager, jobTitle: 'Site engineer', departmentId: manager },
    });
    expect(parseMemberUpdate(form({ userId: ID, reportsTo: '', jobTitle: '', departmentId: '' }))).toEqual({
      ok: true,
      value: { userId: ID, reportsTo: null, jobTitle: null, departmentId: null },
    });
  });

  it('refuses reporting to yourself, bad ids and long titles', () => {
    expect(parseMemberUpdate(form({ userId: ID, reportsTo: ID }))).toEqual({ ok: false, error: 'Nobody can report to themselves.' });
    expect(parseMemberUpdate(form({ userId: ID, reportsTo: 'x' }))).toEqual({ ok: false, error: 'Choose who they report to.' });
    expect(parseMemberUpdate(form({ userId: ID, departmentId: 'x' }))).toEqual({ ok: false, error: 'Choose a department.' });
    expect(parseMemberUpdate(form({ userId: ID, jobTitle: 'x'.repeat(61) }))).toEqual({ ok: false, error: 'Enter a job title of up to 60 characters.' });
  });

  it('parses an invitation id', () => {
    expect(parseInvitationId(form({ invitationId: ID }))).toEqual({ ok: true, value: ID });
    expect(parseInvitationId(form({ invitationId: '1' }))).toMatchObject({ ok: false });
  });
});
