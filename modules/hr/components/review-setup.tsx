'use client';

import { useState } from 'react';
import { ListChecksIcon, PlusIcon } from 'lucide-react';

import type { ReviewMember, ReviewMetric } from '@/modules/hr/client';
import { Button } from '@/shared/ui/button';
import { MissionPanel } from '@/shared/ui/mission-ui';

import { useReviewCommand } from './review-command';

/**
 * The managing director starts reviews: who, a title (e.g. "October 2026
 * review") and the metrics. Each employee then rates themselves first.
 */
export function NewReview({ members, metrics, defaultTitle }: {
  members: readonly ReviewMember[];
  metrics: readonly ReviewMetric[];
  defaultTitle: string;
}) {
  const active = metrics.filter(metric => metric.active);
  const [title, setTitle] = useState(defaultTitle);
  const [people, setPeople] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string[]>(active.map(metric => metric.id));
  const { pending, send } = useReviewCommand();
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter(item => item !== id) : [...list, id]);
  return (
    <MissionPanel icon={PlusIcon} title="New review" subtitle="Each employee you choose gets their own review sheet and rates themselves first.">
      <div className="grid gap-4">
        <label className="field-label">
          Title
          <input className="field" value={title} maxLength={120} onChange={event => setTitle(event.target.value)} />
        </label>
        <fieldset className="grid gap-2">
          <legend className="field-label mb-1 flex w-full items-center justify-between">
            Employees
            <button type="button" className="text-primary text-xs font-medium hover:underline"
              onClick={() => setPeople(people.length === members.length ? [] : members.map(member => member.id))}>
              {people.length === members.length ? 'Clear' : 'Select all'}
            </button>
          </legend>
          <div className="grid max-h-56 gap-1.5 overflow-y-auto sm:grid-cols-2">
            {members.map(member => (
              <label key={member.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={people.includes(member.id)} onChange={() => setPeople(toggle(people, member.id))} />
                <span className="truncate">{member.fullName}</span>
                <span className="text-muted-foreground text-xs">{member.employeeCode}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="grid gap-2">
          <legend className="field-label mb-1">Metrics</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {active.map(metric => (
              <label key={metric.id} className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={chosen.includes(metric.id)} onChange={() => setChosen(toggle(chosen, metric.id))} />
                <span>
                  {metric.name}
                  {metric.description ? <span className="text-muted-foreground block text-xs">{metric.description}</span> : null}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex justify-end">
          <Button
            type="button"
            disabled={pending || !people.length || !chosen.length || !title.trim()}
            onClick={() => send(
              { op: 'create', payload: { employeeIds: people, metricIds: chosen, title } },
              `Review sent to ${people.length} ${people.length === 1 ? 'person' : 'people'}.`,
              () => setPeople([]),
            )}
          >
            Start {people.length > 1 ? `${people.length} reviews` : 'review'}
          </Button>
        </div>
      </div>
    </MissionPanel>
  );
}

/** The managing director's list of review metrics: rename, describe, switch off or add. */
export function ReviewMetrics({ metrics }: { metrics: readonly ReviewMetric[] }) {
  const { pending, send } = useReviewCommand();
  const [adding, setAdding] = useState({ name: '', description: '' });
  return (
    <MissionPanel icon={ListChecksIcon} title="Review metrics" subtitle="What employees rate themselves on. Changes apply to new reviews; past reviews keep their metrics.">
      <ul className="grid gap-2">
        {metrics.map(metric => <MetricRow key={metric.id} metric={metric} pending={pending} send={send} />)}
      </ul>
      <div className="border-border mt-4 grid gap-2 border-t pt-4 sm:grid-cols-[1fr_2fr_auto]">
        <input className="field" placeholder="New metric" maxLength={60} value={adding.name} onChange={event => setAdding({ ...adding, name: event.target.value })} />
        <input className="field" placeholder="What it means (optional)" maxLength={200} value={adding.description} onChange={event => setAdding({ ...adding, description: event.target.value })} />
        <Button type="button" variant="outline" disabled={pending || !adding.name.trim()}
          onClick={() => send({ op: 'metric', payload: { ...adding, active: true } }, 'Metric added.', () => setAdding({ name: '', description: '' }))}>
          Add
        </Button>
      </div>
    </MissionPanel>
  );
}

function MetricRow({ metric, pending, send }: { metric: ReviewMetric; pending: boolean; send: ReturnType<typeof useReviewCommand>['send'] }) {
  const [draft, setDraft] = useState({ name: metric.name, description: metric.description });
  const changed = draft.name !== metric.name || draft.description !== metric.description;
  const save = (active: boolean, message: string) =>
    send({ op: 'metric', payload: { id: metric.id, ...draft, active, sort: metric.sort } }, message);
  return (
    <li className="grid gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-center">
      <input className="field" aria-label="Metric name" maxLength={60} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} />
      <input className="field" aria-label="Metric description" maxLength={200} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} />
      <span className="flex gap-2">
        {changed ? <Button type="button" size="sm" disabled={pending || !draft.name.trim()} onClick={() => save(metric.active, 'Metric saved.')}>Save</Button> : null}
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => save(!metric.active, metric.active ? 'Metric switched off.' : 'Metric switched on.')}>
          {metric.active ? 'Switch off' : 'Switch on'}
        </Button>
      </span>
    </li>
  );
}
