'use client';

import * as React from 'react';
import { LoaderCircleIcon, MailPlusIcon, UsersIcon } from 'lucide-react';
import { toast } from 'sonner';

import type { Invitation, PeopleAdminData, Placement } from '@/modules/team/client';
import {
  inviteMember,
  revokeInvitation,
  updateMember,
  type PeopleActionState,
} from '@/modules/team/people-actions';
import { Button } from '@/shared/ui/button';
import { InitialsAvatar, EmptyState, MissionPanel } from '@/shared/ui/mission-ui';
import { RoleBadge } from '@/shared/ui/tracker-badges';
import { ROLE_LABELS, USER_ROLES } from '@/shared/tracker/enums';
import type { User } from '@/types/tracker';

type Action = (prev: PeopleActionState | null, form: FormData) => Promise<PeopleActionState>;

/** useActionState plus a toast for the outcome. */
function useCommand(action: Action, onSuccess?: () => void) {
  const [state, run, pending] = React.useActionState(action, null);
  React.useEffect(() => {
    if (!state) return;
    if (state.success) {
      toast.success(state.data?.message ?? 'Saved.');
      onSuccess?.();
    } else {
      toast.error(state.error);
    }
    // The state object changes once per submission.
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  return [run, pending] as const;
}

function RoleOptions() {
  return USER_ROLES.map((role) => (
    <option key={role} value={role}>
      {ROLE_LABELS[role]}
    </option>
  ));
}

export function InviteForm() {
  const formRef = React.useRef<HTMLFormElement>(null);
  const [run, pending] = useCommand(inviteMember, () => formRef.current?.reset());
  return (
    <MissionPanel
      icon={MailPlusIcon}
      title="Invite a person"
      subtitle="They get access only after they sign up with this exact email (password or Google)."
    >
      <form ref={formRef} action={run} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_2fr_1fr_1.4fr_auto] lg:items-end">
        <label className="field-label">
          Email
          <input name="email" type="email" required autoComplete="off" placeholder="name@company.com" className="field" />
        </label>
        <label className="field-label">
          Full name
          <input name="fullName" required maxLength={120} placeholder="As it should appear in reports" className="field" />
        </label>
        <label className="field-label">
          Employee ID
          <input name="employeeId" required maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9_\-]*" placeholder="SAH-011" className="field" />
        </label>
        <label className="field-label">
          Role
          <select name="role" defaultValue="team_member" className="field">
            <RoleOptions />
          </select>
        </label>
        <Button type="submit" disabled={pending} className="sm:col-span-2 lg:col-span-1">
          {pending ? <LoaderCircleIcon className="animate-spin" aria-hidden="true" /> : null}
          Send invite
        </Button>
      </form>
    </MissionPanel>
  );
}

export function InvitationList({ invitations }: { invitations: Invitation[] }) {
  return (
    <MissionPanel
      icon={MailPlusIcon}
      title="Waiting to join"
      subtitle="Open invitations. Withdraw one to stop that email from getting access."
    >
      {invitations.length === 0 ? (
        <EmptyState>No open invitations.</EmptyState>
      ) : (
        <ul className="divide-border divide-y">
          {invitations.map((invite) => (
            <li key={invite.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-foreground text-sm font-semibold">{invite.fullName}</p>
                <p className="text-muted-foreground text-xs break-all">
                  {invite.email} · <span className="font-mono">{invite.employeeId}</span> · invited{' '}
                  {new Date(invite.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </p>
              </div>
              <RoleBadge role={invite.role} />
              <RevokeButton id={invite.id} />
            </li>
          ))}
        </ul>
      )}
    </MissionPanel>
  );
}

function RevokeButton({ id }: { id: string }) {
  const [run, pending] = useCommand(revokeInvitation);
  return (
    <form action={run}>
      <input type="hidden" name="invitationId" value={id} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        Withdraw
      </Button>
    </form>
  );
}

type Departments = PeopleAdminData['departments'];
const NO_PLACEMENT: Placement = { reportsTo: null, jobTitle: null, departmentId: null };

/** Everyone under a person (any depth), so they can't be chosen as that person's manager. */
function teamOf(id: string, placement: Record<string, Placement>): Set<string> {
  const under = new Set<string>();
  const queue = [id];
  while (queue.length) {
    const current = queue.shift()!;
    for (const [user, place] of Object.entries(placement)) {
      if (place.reportsTo === current && !under.has(user)) { under.add(user); queue.push(user); }
    }
  }
  return under;
}

export function MemberList({ members, viewerId, placement = {}, departments = [] }: {
  members: User[];
  viewerId: string;
  placement?: Record<string, Placement>;
  departments?: Departments;
}) {
  const active = members.filter((m) => m.isActive);
  const inactive = members.filter((m) => !m.isActive);
  return (
    <MissionPanel
      icon={UsersIcon}
      title="Members"
      subtitle="Change a role or details, or remove access. Removed members keep their records in reports."
    >
      <ul className="divide-border divide-y">
        {active.map((m) => (
          <MemberRow key={m.id} member={m} self={m.id === viewerId} members={active} placement={placement} departments={departments} />
        ))}
      </ul>
      {inactive.length > 0 ? (
        <>
          <h3 className="eyebrow mt-6 mb-1">No access</h3>
          <ul className="divide-border divide-y">
            {inactive.map((m) => (
              <MemberRow key={m.id} member={m} self={false} members={active} placement={placement} departments={departments} />
            ))}
          </ul>
        </>
      ) : null}
    </MissionPanel>
  );
}

function MemberRow({ member, self, members, placement, departments }: {
  member: User;
  self: boolean;
  /** Active members: the choices for Reports to. */
  members: User[];
  placement: Record<string, Placement>;
  departments: Departments;
}) {
  const [editing, setEditing] = React.useState(false);
  const place = placement[member.id] ?? NO_PLACEMENT;
  const hasPlacement = Object.keys(placement).length > 0;
  const blocked = React.useMemo(() => teamOf(member.id, placement), [member.id, placement]);
  const managers = members.filter((m) => m.id !== member.id && !blocked.has(m.id));
  const manager = place.reportsTo ? members.find((m) => m.id === place.reportsTo) : undefined;
  const department = place.departmentId ? departments.find((d) => d.id === place.departmentId) : undefined;
  const departmentChoices = departments.filter((d) => d.active || d.id === place.departmentId);
  const [save, saving] = useCommand(updateMember, () => setEditing(false));
  const [toggle, toggling] = useCommand(updateMember);
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <InitialsAvatar name={member.fullName} />
        <div className="min-w-0 flex-1">
          <p className="text-foreground text-sm font-semibold">
            {member.fullName}
            {self ? <span className="text-muted-foreground font-normal"> (you)</span> : null}
          </p>
          <p className="text-muted-foreground text-xs break-all">
            <span className="font-mono">{member.employeeId}</span> · {member.email}
          </p>
          {hasPlacement && (place.jobTitle || department || manager) ? (
            <p className="text-muted-foreground text-xs">
              {[place.jobTitle, department?.name, manager ? `Reports to ${manager.fullName}` : null].filter(Boolean).join(' · ')}
            </p>
          ) : null}
        </div>
        <RoleBadge role={member.role} />
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
            {editing ? 'Cancel' : 'Edit'}
          </Button>
          {self ? null : (
            <form
              action={toggle}
              onSubmit={(event) => {
                if (member.isActive && !window.confirm(`Remove ${member.fullName}'s access? They lose access to TaskPulse; their records stay.`)) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="userId" value={member.id} />
              <input type="hidden" name="isActive" value={member.isActive ? 'false' : 'true'} />
              <Button type="submit" variant={member.isActive ? 'outline' : 'default'} size="sm" disabled={toggling}>
                {member.isActive ? 'Remove access' : 'Restore access'}
              </Button>
            </form>
          )}
        </div>
      </div>
      {editing ? (
        <form action={save} className="mt-3 grid gap-3 sm:grid-cols-[2fr_1fr_1.4fr_auto] sm:items-end">
          <input type="hidden" name="userId" value={member.id} />
          <label className="field-label">
            Full name
            <input name="fullName" defaultValue={member.fullName} required maxLength={120} className="field" />
          </label>
          <label className="field-label">
            Employee ID
            <input name="employeeId" defaultValue={member.employeeId} required maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9_\-]*" className="field" />
          </label>
          <label className="field-label">
            Role
            <select name="role" defaultValue={member.role} disabled={self} className="field">
              <RoleOptions />
            </select>
          </label>
          {hasPlacement ? (
            <div className="grid gap-3 sm:col-span-4 sm:grid-cols-3">
              <label className="field-label">
                Reports to
                <select name="reportsTo" defaultValue={place.reportsTo ?? ''} className="field">
                  <option value="">Nobody (top of the chart)</option>
                  {managers.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
                </select>
              </label>
              <label className="field-label">
                Job title
                <input name="jobTitle" defaultValue={place.jobTitle ?? ''} maxLength={60} placeholder="Site engineer…" className="field" />
              </label>
              <label className="field-label">
                Department
                <select name="departmentId" defaultValue={place.departmentId ?? ''} className="field">
                  <option value="">None</option>
                  {departmentChoices.map((d) => <option key={d.id} value={d.id}>{d.name}{d.active ? '' : ' (hidden)'}</option>)}
                </select>
              </label>
              {departments.length === 0 ? (
                <p className="text-muted-foreground text-xs sm:col-span-3">Add departments in Settings &gt; Company to choose one here.</p>
              ) : null}
            </div>
          ) : null}
          <Button type="submit" disabled={saving} className="sm:col-start-4">
            {saving ? <LoaderCircleIcon className="animate-spin" aria-hidden="true" /> : null}
            Save
          </Button>
          {self ? <p className="text-muted-foreground text-xs sm:col-span-4">You can’t change your own role; another managing director can.</p> : null}
        </form>
      ) : null}
    </li>
  );
}
