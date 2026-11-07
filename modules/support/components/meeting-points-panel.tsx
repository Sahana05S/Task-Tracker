'use client';

import * as React from 'react';
import Link from 'next/link';
import { CircleCheckIcon, CircleDashedIcon, CircleDotIcon, CircleSlashIcon, HistoryIcon, ListTodoIcon } from 'lucide-react';
import { toast } from 'sonner';

import type { Label } from '@/modules/labels/client';
import { LabelInput } from '@/modules/labels/components/label-input';
import {
  nextPointStatus, POINT_MAX_LENGTH, POINT_STATUS_LABEL, POINT_STATUSES, POINT_TYPES,
  type MeetingMission, type MeetingPoint, type PointStatus,
} from '@/modules/support/client';
import { meetingPointAction, setPointStatusAction } from '@/modules/support/meeting-actions';
import { Button } from '@/shared/ui/button';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { InitialsAvatar } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';

export interface PointPerson { readonly id: string; readonly name: string }

const STATUS_STYLE: Record<PointStatus, { icon: typeof CircleDotIcon; className: string }> = {
  'Not Started': { icon: CircleDashedIcon, className: 'badge-neutral' },
  'In Progress': { icon: CircleDotIcon, className: 'badge-status-in-progress' },
  Done: { icon: CircleCheckIcon, className: 'badge-status-done' },
  Discarded: { icon: CircleSlashIcon, className: 'badge-status-discarded' },
};

/**
 * A meeting's points, its action items (migration 136): a one-line quick add (point, who resolves
 * it, due date), each point's status changed with one tap (not started -> in progress -> done),
 * and its details, labels, history and withdrawal behind "Details".
 */
export function MeetingPointsPanel({ meetingId, points, people, missions, labels, catalogue, canEdit, canCreateLabels, viewerId }: {
  meetingId: string;
  points: readonly MeetingPoint[];
  /** Active people who may be asked to resolve a point (anyone in the company; they join the meeting). */
  people: readonly PointPerson[];
  missions: readonly MeetingMission[];
  labels: Readonly<Record<string, readonly Label[]>> | null;
  catalogue: readonly Label[] | null;
  canEdit: boolean;
  canCreateLabels: boolean;
  viewerId: string;
}) {
  const names = new Map(people.map((p) => [p.id, p.name]));
  const open = points.filter((p) => p.status === 'Not Started' || p.status === 'In Progress').length;
  return (
    <section className="soft-card grid gap-4 p-5 sm:p-6" aria-labelledby="points-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="points-heading" className="text-foreground flex items-center gap-2 text-base font-bold tracking-tight">
          <ListTodoIcon className="text-primary size-5" aria-hidden="true" />Points
        </h2>
        <span className="text-muted-foreground text-xs">{points.length ? `${open} open of ${points.length}` : 'Action items and decisions'}</span>
      </div>
      {canEdit ? <QuickAdd meetingId={meetingId} people={people} viewerId={viewerId} /> : null}
      {points.length ? (
        <ol className="divide-border grid divide-y">
          {points.map((point) => (
            <PointRow key={point.id} meetingId={meetingId} point={point} names={names} people={people} missions={missions}
              labels={labels?.[point.id] ?? []} catalogue={catalogue} canEdit={canEdit} canCreateLabels={canCreateLabels} />
          ))}
        </ol>
      ) : <p className="text-muted-foreground text-sm">No points yet.{canEdit ? ' Add the first one above.' : ''}</p>}
    </section>
  );
}

function QuickAdd({ meetingId, people, viewerId }: { meetingId: string; people: readonly PointPerson[]; viewerId: string }) {
  return (
    <ExecutionForm action={meetingPointAction} scope={`meeting-point:add:${meetingId}`} className="bg-muted/50 rounded-xl p-3">
      <input type="hidden" name="op" value="add" />
      <input type="hidden" name="meetingId" value={meetingId} />
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_9.5rem_auto] sm:items-end">
        <label className="field-label">Point
          <input name="point" required maxLength={POINT_MAX_LENGTH} placeholder="What needs doing or was decided" className="field" data-autofocus />
        </label>
        <div className="grid grid-cols-2 gap-2 sm:contents">
          <label className="field-label">Owner
            <select name="owner_id" defaultValue={viewerId} className="field">
              <option value="">No owner yet</option>
              {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          </label>
          <label className="field-label">Due
            <input type="date" name="resolution_due" className="field" />
          </label>
        </div>
        <Button type="submit">Add</Button>
      </div>
    </ExecutionForm>
  );
}

function StatusButton({ meetingId, point, canEdit }: { meetingId: string; point: MeetingPoint; canEdit: boolean }) {
  const [pending, start] = React.useTransition();
  const style = STATUS_STYLE[point.status];
  const Icon = style.icon;
  const next = nextPointStatus(point.status);
  const label = POINT_STATUS_LABEL[point.status];
  if (!canEdit) return <span className={cn('badge-soft inline-flex shrink-0 items-center gap-1', style.className)}><Icon className="size-3.5" aria-hidden="true" />{label}</span>;
  return (
    <button
      type="button"
      disabled={pending}
      title={`Mark ${POINT_STATUS_LABEL[next].toLowerCase()}`}
      aria-label={`${label}. Mark ${POINT_STATUS_LABEL[next].toLowerCase()}`}
      onClick={() => start(async () => {
        const result = await setPointStatusAction({ meetingId, pointId: point.id, status: next, version: point.version, operationId: crypto.randomUUID() });
        if (!result.success) toast.error(result.errorCode === 'conflict' ? 'Someone else changed this point. Reload and try again.' : result.error ?? 'The status was not changed.');
      })}
      className={cn('badge-soft inline-flex min-h-8 shrink-0 items-center gap-1 disabled:opacity-60', style.className)}
    >
      <Icon className="size-3.5" aria-hidden="true" />{label}
    </button>
  );
}

function PointRow({ meetingId, point, names, people, missions, labels, catalogue, canEdit, canCreateLabels }: {
  meetingId: string; point: MeetingPoint; names: ReadonlyMap<string, string>; people: readonly PointPerson[]; missions: readonly MeetingMission[];
  labels: readonly Label[]; catalogue: readonly Label[] | null; canEdit: boolean; canCreateLabels: boolean;
}) {
  const owner = point.ownerId ? names.get(point.ownerId) ?? 'Former member' : null;
  const overdue = point.due && (point.status === 'Not Started' || point.status === 'In Progress') && point.due < new Date().toISOString().slice(0, 10);
  const mission = point.relatedTaskId ? missions.find((m) => m.id === point.relatedTaskId) : null;
  return (
    <li id={`point-${point.id}`} className="target:bg-primary-subtle/50 grid scroll-mt-24 gap-2 py-3">
      <div className="flex items-start gap-3">
        <div className="grid min-w-0 flex-1 gap-1">
          <p className={cn('text-foreground text-[15px] leading-snug whitespace-pre-wrap break-words', point.status === 'Discarded' && 'text-muted-foreground line-through')}>{point.point}</p>
          <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {owner ? <span className="inline-flex items-center gap-1"><InitialsAvatar name={owner} className="size-5 text-[8px]" />{owner}</span> : <span>No owner yet</span>}
            {point.due ? <span className={cn(overdue && 'text-danger font-semibold')}>Due {formatDay(point.due)}</span> : null}
            {point.resolvedOn ? <span>Resolved {formatDay(point.resolvedOn)}</span> : null}
            {point.pointType && point.pointType !== 'General Point' ? <span>{point.pointType}</span> : null}
            {mission ? <Link href={`/tasks/${encodeURIComponent(mission.tag)}`} className="link font-mono">{mission.tag}</Link> : null}
          </p>
          {point.resolution ? <p className="text-foreground text-sm"><span className="text-muted-foreground">Resolution: </span>{point.resolution}</p> : null}
        </div>
        <StatusButton meetingId={meetingId} point={point} canEdit={canEdit} />
      </div>
      {catalogue ? <LabelInput kind="meeting_point" subjectId={point.id} labels={labels} catalogue={catalogue} canEdit={canEdit} canCreate={canCreateLabels} hideEmpty /> : null}
      <details className="disclosure">
        <summary>Details</summary>
        <div className="grid gap-3 pt-2">
          {point.comments ? <p className="text-sm whitespace-pre-wrap"><span className="text-muted-foreground">Comments: </span>{point.comments}</p> : null}
          {canEdit ? <PointEditor meetingId={meetingId} point={point} people={people} missions={missions} /> : null}
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/records/meeting/${point.id}/history`} className="link inline-flex items-center gap-1 text-sm"><HistoryIcon className="size-3.5" aria-hidden="true" />History</Link>
            {canEdit && point.canWithdraw ? (
              <ExecutionForm action={meetingPointAction} scope={`meeting-point:withdraw:${point.id}`}>
                <input type="hidden" name="op" value="withdraw" />
                <input type="hidden" name="meetingId" value={meetingId} />
                <input type="hidden" name="pointId" value={point.id} />
                <input type="hidden" name="expectedVersion" value={point.version} />
                <Button type="submit" size="sm" variant="ghost" className="text-danger">Withdraw point</Button>
              </ExecutionForm>
            ) : null}
          </div>
        </div>
      </details>
    </li>
  );
}

function PointEditor({ meetingId, point, people, missions }: { meetingId: string; point: MeetingPoint; people: readonly PointPerson[]; missions: readonly MeetingMission[] }) {
  return (
    <ExecutionForm action={meetingPointAction} scope={`meeting-point:edit:${point.id}`} className="grid gap-3">
      <input type="hidden" name="op" value="edit" />
      <input type="hidden" name="meetingId" value={meetingId} />
      <input type="hidden" name="pointId" value={point.id} />
      <input type="hidden" name="expectedVersion" value={point.version} />
      <label className="field-label">Point<textarea name="point" required maxLength={POINT_MAX_LENGTH} defaultValue={point.point} className="field min-h-20" /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="field-label">To be resolved by
          <select name="owner_id" defaultValue={point.ownerId ?? ''} className="field">
            <option value="">No owner yet</option>
            {point.ownerId && !people.some((p) => p.id === point.ownerId) ? <option value={point.ownerId}>Former member</option> : null}
            {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        </label>
        <label className="field-label">Due<input type="date" name="resolution_due" defaultValue={point.due ?? ''} className="field" /></label>
        <label className="field-label">Status
          <select name="resolution_status" defaultValue={point.status} className="field">
            {POINT_STATUSES.map((status) => <option key={status} value={status}>{POINT_STATUS_LABEL[status]}</option>)}
          </select>
        </label>
        <label className="field-label">Point type
          <select name="point_type" defaultValue={point.pointType ?? ''} className="field">
            <option value="">Not classified</option>
            {POINT_TYPES.map((type) => <option key={type}>{type}</option>)}
          </select>
        </label>
        {missions.length ? (
          <label className="field-label sm:col-span-2">Mission
            <select name="related_task_id" defaultValue={point.relatedTaskId ?? ''} className="field">
              <option value="">No mission</option>
              {point.relatedTaskId && !missions.some((m) => m.id === point.relatedTaskId) ? <option value={point.relatedTaskId}>A mission no longer linked</option> : null}
              {missions.map((mission) => <option key={mission.id} value={mission.id}>{mission.tag} - {mission.title}</option>)}
            </select>
          </label>
        ) : null}
      </div>
      <label className="field-label">Resolution<input name="resolution" maxLength={POINT_MAX_LENGTH} defaultValue={point.resolution ?? ''} className="field" /></label>
      <label className="field-label">Comments<textarea name="comments" maxLength={POINT_MAX_LENGTH} defaultValue={point.comments ?? ''} className="field min-h-16" /></label>
      <Button type="submit" size="sm" className="justify-self-start">Save point</Button>
    </ExecutionForm>
  );
}

function formatDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
