import { AwardIcon, CalendarClockIcon, CircleCheckIcon, DatabaseIcon, HistoryIcon, ScaleIcon, TriangleAlertIcon } from 'lucide-react';

import { formatDateTime } from '@/shared/tracker/format';
import { EmptyState, MissionNotice, MissionPage, MissionPageHeader, MissionPanel, StatTile } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';

import {
  describeReason,
  effectiveParameters,
  outcomeLabel,
  PERIOD_LABELS,
  periodLabel,
  templateFor,
  type Audience,
} from '@/modules/policies/client';
import { BadgeSeal } from '@/modules/policies/components/badge-seal';
import { OutcomeStrip } from '@/modules/policies/components/outcome-strip';
import type { EditablePolicy } from '@/modules/policies/components/policy-dialog';
import { NewPolicyButton, PolicyRowActions } from '@/modules/policies/components/policy-row-actions';
import type { CommendationRow, PolicyRow, RunRow } from '@/modules/policies/internal/queries';
import type { PoliciesWorkspaceModel } from '@/modules/policies/internal/workspace';

const STALE_AFTER_MS = 36 * 60 * 60 * 1000;
const TRIGGER_LABELS: Record<RunRow['trigger'], string> = { nightly: 'Nightly', on_demand: 'Evaluate now', invalidation: 'After a correction' };

function rule(policy: PolicyRow): string {
  const template = templateFor(policy.templateKey);
  return template ? template.summary(effectiveParameters(policy), policy.periodKind) : 'A rule this version of TaskPulse does not know.';
}

function editable(policy: PolicyRow): EditablePolicy {
  return {
    id: policy.id, version: policy.version, name: policy.name, description: policy.description, templateKey: policy.templateKey,
    parameters: policy.parameters, periodKind: policy.periodKind, audience: policy.audience as Audience, reward: policy.reward,
  };
}

function StatusChip({ active }: { active: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold',
      active ? 'bg-success-subtle text-success-strong' : 'bg-muted text-muted-foreground')}>
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', active ? 'bg-success' : 'bg-muted-foreground/60')} />
      {active ? 'Active' : 'Paused'}
    </span>
  );
}

function periodText(policy: PolicyRow) {
  return `${PERIOD_LABELS[policy.periodKind].adjective} · ${periodLabel({ kind: policy.periodKind, start: policy.period.start, end: policy.period.end })}`;
}

/** The managing director's and engineers' list: a sheet-style table on wide screens, cards on phones. */
function ManagerList({ policies, canManage, members }: { policies: PolicyRow[]; canManage: boolean; members: NonNullable<PoliciesWorkspaceModel['members']> }) {
  const people = members.status === 'ready' ? members.data : [];
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="sheet-grid">
          <caption className="sr-only">Policies with this period’s results</caption>
          <thead>
            <tr>
              <th scope="col" className="w-[38%]">Policy</th>
              <th scope="col">Period</th>
              <th scope="col">Commendation</th>
              <th scope="col">Status</th>
              <th scope="col" className="min-w-40">This period</th>
              {canManage ? <th scope="col"><span className="sr-only">Actions</span></th> : null}
            </tr>
          </thead>
          <tbody>
            {policies.map((p) => (
              <tr key={p.id}>
                <td className="py-2.5">
                  <p className="text-foreground font-semibold">{p.name}</p>
                  <p className="text-muted-foreground text-xs text-pretty">{rule(p)}</p>
                </td>
                <td className="text-xs whitespace-nowrap">
                  <span className="text-foreground block font-medium">{PERIOD_LABELS[p.periodKind].adjective}</span>
                  <span className="text-muted-foreground block">{periodLabel({ kind: p.periodKind, start: p.period.start, end: p.period.end })}</span>
                </td>
                <td><BadgeSeal badge={p.reward.badge} points={p.reward.points} /></td>
                <td><StatusChip active={p.active} /></td>
                <td>
                  <OutcomeStrip counts={p.counts} />
                  {p.lastEvaluatedAt ? <p className="text-muted-foreground mt-0.5 text-[11px]">Checked {formatDateTime(p.lastEvaluatedAt)}</p> : null}
                </td>
                {canManage ? <td><PolicyRowActions policy={editable(p)} active={p.active} periodKey={p.period.key} members={people} /></td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="grid gap-3 md:hidden">
        {policies.map((p) => (
          <li key={p.id} className="border-border grid gap-3 rounded-2xl border bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-foreground font-semibold">{p.name}</p>
                <p className="text-muted-foreground text-xs">{periodText(p)}</p>
              </div>
              <StatusChip active={p.active} />
            </div>
            <p className="text-foreground text-sm text-pretty">{rule(p)}</p>
            <BadgeSeal badge={p.reward.badge} points={p.reward.points} />
            <OutcomeStrip counts={p.counts} />
            {canManage ? <PolicyRowActions policy={editable(p)} active={p.active} periodKey={p.period.key} members={people} /> : null}
          </li>
        ))}
      </ul>
    </>
  );
}

/** What a member sees: the rules that apply to them and where they stand this period. */
function MemberList({ policies }: { policies: PolicyRow[] }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {policies.map((p) => {
        const reason = p.mine?.reasons[0];
        return (
          <li key={p.id} className="border-border grid content-start gap-3 rounded-2xl border bg-white p-4">
            <div>
              <p className="text-foreground font-semibold">{p.name}</p>
              <p className="text-muted-foreground text-xs">{periodText(p)}</p>
            </div>
            <p className="text-foreground text-sm text-pretty">{rule(p)}</p>
            {p.description ? <p className="text-muted-foreground text-xs text-pretty">{p.description}</p> : null}
            <BadgeSeal badge={p.reward.badge} points={p.reward.points} />
            <div className="bg-muted/70 rounded-xl px-3 py-2 text-sm">
              <p className="text-foreground font-semibold">
                {p.mine ? `You: ${outcomeLabel(p.mine.outcome, p.mine.final)}` : 'You: not checked yet this period'}
              </p>
              {reason ? <p className="text-muted-foreground text-xs">{describeReason(reason)}</p>
                : !p.mine ? <p className="text-muted-foreground text-xs">Results are checked every night.</p> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Commendations({ rows }: { rows: CommendationRow[] }) {
  if (!rows.length) {
    return <EmptyState icon={AwardIcon} title="No commendations yet">Meet a policy for a whole period to earn its badge. It appears here the morning after the period ends.</EmptyState>;
  }
  return (
    <ul className="divide-border grid divide-y">
      {rows.map((c) => (
        <li key={`${c.policyId}:${c.periodKey}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
          <BadgeSeal badge={c.badge} points={c.points} size="md" />
          <p className="text-muted-foreground text-xs">
            {c.policyName} · {periodLabel({ kind: c.periodKind, start: c.periodStart, end: c.periodEnd })}
          </p>
        </li>
      ))}
    </ul>
  );
}

function RunsPanel({ runs }: { runs: RunRow[] }) {
  if (!runs.length) return <EmptyState icon={HistoryIcon}>No evaluations yet. The nightly run checks every active policy.</EmptyState>;
  return (
    <ul className="grid gap-1.5">
      {runs.map((r) => (
        <li key={r.id} className={cn('flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 rounded-xl px-3 py-2 text-sm',
          r.status === 'failed' ? 'bg-attention-subtle text-attention-foreground' : 'bg-muted/70')}>
          <span className="font-medium">
            {r.status === 'failed' ? `Failed (${r.errorCode})` : `${r.summary.periods ?? 0} periods, ${r.summary.changed ?? 0} results changed`}
            <span className="text-muted-foreground font-normal"> · {TRIGGER_LABELS[r.trigger]}</span>
          </span>
          <span className="text-muted-foreground text-xs tabular-nums">{formatDateTime(r.recordedAt)}</span>
          {r.status === 'failed' && r.errorDetail ? <span className="w-full text-xs">{r.errorDetail}</span> : null}
        </li>
      ))}
    </ul>
  );
}

export function PoliciesWorkspace({ model, now }: { model: PoliciesWorkspaceModel; now: number }) {
  const list = model.list.status === 'ready' ? model.list.data : null;
  const policies = list?.policies ?? [];
  const active = policies.filter((p) => p.active);
  const manager = list?.isManager ?? false;
  const canManage = list?.canManage ?? false;
  const mine = model.mine.status === 'ready' ? model.mine.data : null;
  const runs = model.runs?.status === 'ready' ? model.runs.data : null;
  const last = runs?.[0] ?? null;
  const lastStale = last ? last.status === 'failed' || now - new Date(last.recordedAt).getTime() > STALE_AFTER_MS : false;
  const sum = (key: 'met' | 'notMet' | 'unavailable') => active.reduce((n, p) => n + (p.counts?.[key] ?? 0), 0);
  const members = model.members ?? { status: 'ready' as const, data: [] };

  return (
    <MissionPage>
      <MissionPageHeader
        eyebrow="Policies"
        title="Policies"
        chip={list ? `${active.length} active` : undefined}
        description="Company rules for attendance, logging and missions. Meet one for a whole period to earn its badge and recognition points; points never change performance scores."
        actions={canManage ? <NewPolicyButton members={members.status === 'ready' ? members.data : []} /> : null}
      />

      {model.missing ? (
        <MissionNotice tone="attention" icon={DatabaseIcon}>Policies need a database update (migration 56) before they can be used here.</MissionNotice>
      ) : !list ? (
        <MissionNotice tone="danger" icon={TriangleAlertIcon}>Policies could not be loaded. Refresh the page to try again.</MissionNotice>
      ) : null}

      {list ? (
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile icon={ScaleIcon} label="Active policies" value={active.length} note={policies.length > active.length ? `${policies.length - active.length} paused` : undefined} />
          {manager ? (
            <>
              <StatTile icon={CircleCheckIcon} label="Met this period" value={sum('met')} note={`${sum('notMet')} not met so far`} />
              <StatTile icon={TriangleAlertIcon} label="Can’t be judged" value={sum('unavailable')}
                note="Usually attendance or check-in times missing" />
              <StatTile icon={CalendarClockIcon} label="Last evaluation" tone={lastStale ? 'alert' : 'default'}
                value={last ? formatDateTime(last.recordedAt) : runs ? 'Not yet' : 'Unavailable'}
                note={last?.status === 'failed' ? `Failed: ${last.errorCode}` : lastStale ? 'More than 36 hours ago' : undefined} />
            </>
          ) : (
            <>
              <StatTile icon={CircleCheckIcon} label="On track or met" value={policies.filter((p) => p.mine?.outcome === 'met').length} note="This period" />
              <StatTile icon={AwardIcon} label="Commendations" value={mine ? mine.length : 'Unavailable'} />
              <StatTile icon={AwardIcon} label="Recognition points" value={mine ? mine.reduce((n, c) => n + c.points, 0) : 'Unavailable'} note="From policies" />
            </>
          )}
        </dl>
      ) : null}

      {list ? (
        <MissionPanel icon={ScaleIcon} title={manager ? 'Policies' : 'Policies in force'}
          subtitle={manager ? 'This period’s results, checked every night' : 'The rules that apply to you and where you stand this period'}>
          {policies.length ? (manager ? <ManagerList policies={policies} canManage={canManage} members={members} /> : <MemberList policies={policies} />)
            : <EmptyState icon={ScaleIcon} title={canManage ? 'No policies yet' : 'No policies apply to you yet'}>
              {canManage ? 'Create one from a template, for example on time every working day this month.' : 'When the managing director sets one, it shows here with your progress.'}
            </EmptyState>}
        </MissionPanel>
      ) : null}

      <MissionPanel icon={AwardIcon} title="My commendations" subtitle="Badges you earned by meeting a policy for a whole period">
        {mine ? <Commendations rows={mine} /> : <EmptyState icon={AwardIcon}>Commendations could not be loaded right now.</EmptyState>}
      </MissionPanel>

      {manager && model.runs ? (
        <MissionPanel icon={HistoryIcon} title="Recent runs" subtitle="Every evaluation, including failures; failures also notify the managing director">
          {runs ? <RunsPanel runs={runs} /> : <EmptyState icon={HistoryIcon}>Runs could not be loaded right now.</EmptyState>}
        </MissionPanel>
      ) : null}
    </MissionPage>
  );
}
