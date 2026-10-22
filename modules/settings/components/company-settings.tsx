'use client';

import * as React from 'react';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarDaysIcon,
  CheckIcon,
  ListOrderedIcon,
  LoaderCircleIcon,
  PlusIcon,
  RepeatIcon,
  TagsIcon,
  Trash2Icon,
  UsersRoundIcon,
} from 'lucide-react';

import { saveCompanySettings, type CompanySettingsActionState } from '@/modules/settings/actions';
import {
  buildCategoryCatalogue,
  categoryLabelMap,
  formatSheetTag,
  renderTitlePattern,
  type CompanySettings,
  type SettingsSection,
  type StandingScaleMode,
} from '@/modules/settings/client';
import { prepareOperation } from '@/shared/commands/client-operation';
import { ISO_DATE_PATTERN } from '@/shared/forms/form-data';
import { CATEGORY_LABELS, TASK_CATEGORIES, TASK_PRIORITIES } from '@/shared/tracker/enums';
import { Button } from '@/shared/ui/button';
import { MissionPanel } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';
import type { TaskCategory, TaskPriority } from '@/types/tracker';

import { MeetingAgenda } from './meeting-agenda';

export interface CompanyMember {
  id: string;
  fullName: string;
  isActive: boolean;
}

const SECTIONS = [
  { id: 'mission-types', label: 'Mission types' },
  { id: 'meeting-types', label: 'Meeting types' },
  { id: 'agenda', label: 'Meeting agenda' },
  { id: 'standing-missions', label: 'Standing missions' },
  { id: 'holidays', label: 'Holidays' },
] as const;

const SCALE_LABELS: Record<StandingScaleMode, string> = {
  hours: 'Hours logged',
  manual: 'Fixed weight',
  activity_count: 'Activity count',
};

/**
 * Settings > Company: the workbook's A_Sheet_Attributes, meeting agenda and
 * standing monthly rows, per company. Each section saves on its own (one
 * versioned command per section), so editing one never overwrites another.
 */
export function CompanySettingsEditor({ settings, members }: { settings: CompanySettings; members: readonly CompanyMember[] }) {
  return (
    <div className="grid gap-5 lg:gap-6">
      <nav aria-label="Company settings sections" className="flex max-w-full gap-1.5 overflow-x-auto pb-1">
        {SECTIONS.map((section) => (
          <a key={section.id} href={`#${section.id}`} className="filter-pill shrink-0">
            {section.label}
          </a>
        ))}
      </nav>
      <MissionTypesSection settings={settings} />
      <MeetingTypesSection settings={settings} />
      <AgendaSection settings={settings} />
      <StandingMissionsSection settings={settings} members={members} />
      <HolidaysSection settings={settings} />
    </div>
  );
}

interface SectionProps {
  settings: CompanySettings;
}

/* -------------------------------------------------------------------------- */
/* Save wrapper                                                               */
/* -------------------------------------------------------------------------- */

/**
 * One section's form: sends the section payload with the expected version and
 * an operation id kept across a retry of the same submission.
 */
function SectionForm({
  section,
  version,
  payload,
  dirty,
  onDiscard,
  children,
}: {
  section: SettingsSection;
  /** The settings version this form was loaded at; a save refreshes the page with the next one. */
  version: number;
  payload: () => unknown;
  dirty: boolean;
  /** Puts the section back to what was last saved. */
  onDiscard: () => void;
  children: React.ReactNode;
}) {
  const [state, action, pending] = React.useActionState(
    async (previous: CompanySettingsActionState | null, form: FormData) => {
      try {
        const finish = await prepareOperation(form, `company_settings_${section}`);
        const result = await saveCompanySettings(previous, form);
        // Any answer settles the operation; only a lost response keeps it for a retry.
        finish();
        return result;
      } catch {
        return { success: false, error: 'The connection dropped. Save again to finish the same change.' };
      }
    },
    null,
  );
  const saved = state?.success === true && !dirty;
  // Leaving with an unsaved section asks first (the browser shows its own wording).
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const errorId = `${section}-error`;
  return (
    <form
      action={action}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        form.set('payload', JSON.stringify(payload()));
        React.startTransition(() => action(form));
      }}
      aria-describedby={state && !state.success ? errorId : undefined}
      className="grid gap-4"
    >
      <input type="hidden" name="section" value={section} />
      <input type="hidden" name="expectedVersion" value={version} />
      <input type="hidden" name="operationId" value="" />
      {children}
      <div className="border-border flex flex-wrap items-center gap-3 border-t pt-4">
        <Button type="submit" disabled={pending || !dirty}>
          {pending ? <LoaderCircleIcon className="animate-spin" aria-hidden="true" /> : null}
          Save
        </Button>
        {dirty && !pending ? (
          <Button type="button" variant="ghost" onClick={onDiscard}>
            Discard changes
          </Button>
        ) : null}
        <p role="status" className="text-muted-foreground text-xs">
          {pending ? 'Saving…' : dirty ? 'Unsaved changes' : saved ? (
            <span className="text-success-strong inline-flex items-center gap-1 font-medium">
              <CheckIcon className="size-3.5" aria-hidden="true" />
              Saved
            </span>
          ) : null}
        </p>
        {state && !state.success ? (
          <p id={errorId} role="alert" className="text-danger-foreground basis-full text-sm">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}

/** Tracks an editable copy of a section and whether it differs from what was loaded. */
function useDraft<T>(initial: T) {
  const [draft, setDraft] = React.useState(initial);
  const loaded = React.useMemo(() => JSON.stringify(initial), [initial]);
  // A newer server copy (after a save or a reload) replaces the draft.
  React.useEffect(() => setDraft(JSON.parse(loaded) as T), [loaded]);
  const reset = () => setDraft(JSON.parse(loaded) as T);
  return [draft, setDraft, JSON.stringify(draft) !== loaded, reset] as const;
}

/** A draft list with the row edits every section offers. */
function useRows<T>(initial: T[]) {
  const [rows, setRows, dirty, reset] = useDraft(initial);
  return {
    rows,
    dirty,
    reset,
    update: (index: number, patch: Partial<T>) => setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row))),
    remove: (index: number) => setRows((current) => current.filter((_, i) => i !== index)),
    add: (row: T) => setRows((current) => [...current, row]),
    moveBy: (index: number, delta: number) =>
      setRows((current) => {
        const target = index + delta;
        if (target < 0 || target >= current.length) return current;
        const next = [...current];
        [next[index], next[target]] = [next[target], next[index]];
        return next;
      }),
  };
}

function AddRowButton({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={onAdd}>
      <PlusIcon aria-hidden="true" />
      {label}
    </Button>
  );
}

function OrderButtons({ index, count, label, onMove }: { index: number; count: number; label: string; onMove: (delta: number) => void }) {
  return (
    <span className="flex gap-1">
      <button type="button" className="icon-button size-8 disabled:opacity-40" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move ${label} up`}>
        <ArrowUpIcon className="size-4" aria-hidden="true" />
      </button>
      <button type="button" className="icon-button size-8 disabled:opacity-40" disabled={index === count - 1} onClick={() => onMove(1)} aria-label={`Move ${label} down`}>
        <ArrowDownIcon className="size-4" aria-hidden="true" />
      </button>
    </span>
  );
}

function RemoveButton({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button type="button" className="icon-button text-danger-foreground size-8" onClick={onRemove} aria-label={`Remove ${label}`}>
      <Trash2Icon className="size-4" aria-hidden="true" />
    </button>
  );
}

function InUse({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium whitespace-nowrap">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="accent-primary size-4" aria-label={`${label} in use`} />
      In use
    </label>
  );
}

const ROW = 'border-border grid items-center gap-x-3 gap-y-2 border-b py-3 last:border-b-0';
const CODE = 'task-tag bg-primary-subtle text-primary-subtle-foreground rounded-md px-2 py-0.5 text-center';

/* -------------------------------------------------------------------------- */
/* Mission types                                                              */
/* -------------------------------------------------------------------------- */

function MissionTypesSection({ settings }: SectionProps) {
  const initial = React.useMemo(
    () => buildCategoryCatalogue(settings.categoryOverrides).map(({ code, label, active }) => ({ code, label, active })),
    [settings.categoryOverrides],
  );
  const { rows, dirty, reset, update, moveBy } = useRows(initial);
  return (
    <MissionPanel
      id="mission-types"
      icon={TagsIcon}
      title="Mission types"
      subtitle="Rename, hide or reorder the thirteen types. Codes and tags never change; a hidden type stays on missions that already use it."
      className="scroll-mt-20"
    >
      <SectionForm section="categories" version={settings.version} dirty={dirty} onDiscard={reset} payload={() => ({ entries: rows })}>
        <ul>
          {rows.map((row, index) => (
            <li key={row.code} className={cn(ROW, 'grid-cols-[3.5rem_minmax(0,1fr)] sm:grid-cols-[3.5rem_minmax(0,1fr)_auto_auto]', !row.active && 'opacity-60')}>
              <span className={CODE}>{row.code}</span>
              <label className="grid min-w-0">
                <span className="sr-only">Name for {row.code}</span>
                <input
                  value={row.label}
                  onChange={(event) => update(index, { label: event.target.value })}
                  maxLength={60}
                  required
                  autoComplete="off"
                  className="field"
                  placeholder={CATEGORY_LABELS[row.code]}
                />
              </label>
              <span className="col-start-2 flex items-center justify-between gap-3 sm:col-start-auto sm:contents">
                <InUse checked={row.active} label={row.code} onChange={(active) => update(index, { active })} />
                <OrderButtons index={index} count={rows.length} label={row.code} onMove={(delta) => moveBy(index, delta)} />
              </span>
            </li>
          ))}
        </ul>
      </SectionForm>
    </MissionPanel>
  );
}

/* -------------------------------------------------------------------------- */
/* Meeting types                                                              */
/* -------------------------------------------------------------------------- */

interface MeetingRow {
  /** Kept for saved types; a new row gets a fresh one (the command accepts it). */
  id: string;
  prefix: string;
  name: string;
  active: boolean;
}

function MeetingTypesSection({ settings }: SectionProps) {
  const initial = React.useMemo<MeetingRow[]>(
    () => settings.meetingTypes.map(({ id, prefix, name, active }) => ({ id, prefix, name, active })),
    [settings.meetingTypes],
  );
  const { rows, dirty, reset, update, remove, add, moveBy } = useRows(initial);
  return (
    <MissionPanel
      id="meeting-types"
      icon={UsersRoundIcon}
      title="Meeting types"
      subtitle="The choices for Meeting type on Meeting points. Points already saved keep their type even if you rename or hide it."
      className="scroll-mt-20"
    >
      <SectionForm section="meeting_types" version={settings.version} dirty={dirty} onDiscard={reset} payload={() => ({ types: rows })}>
        {rows.length === 0 ? <p className="text-muted-foreground text-sm">No meeting types yet. Meeting points keep a free-text type until you add some.</p> : null}
        <ul>
          {rows.map((row, index) => (
            <li key={row.id} className={cn(ROW, 'grid-cols-[5rem_minmax(0,1fr)] sm:grid-cols-[5rem_minmax(0,1fr)_auto_auto_auto]', !row.active && 'opacity-60')}>
              <label className="grid">
                <span className="sr-only">Prefix</span>
                <input
                  value={row.prefix}
                  onChange={(event) => update(index, { prefix: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
                  maxLength={6}
                  required
                  pattern="[A-Z][A-Z0-9]{0,5}"
                  placeholder="DL…"
                  autoComplete="off"
                  spellCheck={false}
                  className="field font-mono uppercase"
                />
              </label>
              <label className="grid min-w-0">
                <span className="sr-only">Name</span>
                <input value={row.name} onChange={(event) => update(index, { name: event.target.value })} maxLength={60} required placeholder="Daily…" autoComplete="off" className="field" />
              </label>
              <span className="col-start-2 flex items-center justify-between gap-3 sm:col-start-auto sm:contents">
                <InUse checked={row.active} label={row.name || row.prefix || 'meeting type'} onChange={(active) => update(index, { active })} />
                <OrderButtons index={index} count={rows.length} label={row.name || 'meeting type'} onMove={(delta) => moveBy(index, delta)} />
                <RemoveButton label={row.name || 'meeting type'} onRemove={() => remove(index)} />
              </span>
            </li>
          ))}
        </ul>
        <AddRowButton label="Add meeting type" onAdd={() => add({ id: crypto.randomUUID(), prefix: '', name: '', active: true })} />
      </SectionForm>
    </MissionPanel>
  );
}

/* -------------------------------------------------------------------------- */
/* Agenda                                                                     */
/* -------------------------------------------------------------------------- */

function AgendaSection({ settings }: SectionProps) {
  const [agenda, setAgenda, dirty, reset] = useDraft(settings.meetingAgenda);
  return (
    <MissionPanel
      id="agenda"
      icon={ListOrderedIcon}
      title="Meeting agenda"
      subtitle="Shown at the top of Meeting points for everyone. Number the steps (1. 2. 3.) to show them as a list."
      className="scroll-mt-20"
    >
      <SectionForm section="agenda" version={settings.version} dirty={dirty} onDiscard={reset} payload={() => ({ agenda })}>
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="field-label">
            Agenda text
            <textarea value={agenda} onChange={(event) => setAgenda(event.target.value)} maxLength={4000} rows={7} className="field min-h-40 font-mono text-sm" />
          </label>
          <div className="grid content-start gap-1.5">
            <p className="field-label">Preview</p>
            {agenda.trim() ? <MeetingAgenda agenda={agenda} canEdit={false} /> : <p className="text-muted-foreground text-sm">An empty agenda is hidden on Meeting points.</p>}
          </div>
        </div>
      </SectionForm>
    </MissionPanel>
  );
}

/* -------------------------------------------------------------------------- */
/* Standing missions                                                          */
/* -------------------------------------------------------------------------- */

interface StandingRow {
  id: string;
  titlePattern: string;
  category: TaskCategory;
  priority: TaskPriority;
  /** 'each' = one per member; 'director' = the managing director at setup; else a member id. */
  owner: string;
  scaleMode: StandingScaleMode;
  active: boolean;
}

function StandingMissionsSection({ settings, members }: SectionProps & { members: readonly CompanyMember[] }) {
  const initial = React.useMemo<StandingRow[]>(
    () =>
      settings.standingMissions.map((mission) => ({
        id: mission.id,
        titlePattern: mission.titlePattern,
        category: mission.category,
        priority: mission.priority,
        owner: mission.ownerMode === 'per_member' ? 'each' : mission.ownerId ?? 'director',
        scaleMode: mission.scaleMode,
        active: mission.active,
      })),
    [settings.standingMissions],
  );
  const { rows, dirty, reset, update, remove, add, moveBy } = useRows(initial);
  const labels = React.useMemo(() => categoryLabelMap(buildCategoryCatalogue(settings.categoryOverrides)), [settings.categoryOverrides]);
  const active = members.filter((member) => member.isActive);
  const sample = active[0]?.fullName ?? 'Member name';
  // Example month for the previews: next month, as month setup prepares it.
  const example = React.useMemo(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  }, []);
  const payload = () => ({
    missions: rows.map((row, sort) => ({
      id: row.id,
      titlePattern: row.titlePattern,
      category: row.category,
      priority: row.priority,
      ownerMode: row.owner === 'each' ? 'per_member' : 'single',
      ownerId: row.owner === 'each' || row.owner === 'director' ? null : row.owner,
      scaleMode: row.scaleMode,
      sort,
      active: row.active,
    })),
  });
  return (
    <MissionPanel
      id="standing-missions"
      icon={RepeatIcon}
      title="Standing missions"
      subtitle="The missions every month starts with. Month setup offers this list; changing it never touches missions already created."
      className="scroll-mt-20"
    >
      <SectionForm section="standing_missions" version={settings.version} dirty={dirty} onDiscard={reset} payload={payload}>
        <p className="text-muted-foreground text-xs">
          Write <code className="font-mono">{'{month}'}</code> for the month and <code className="font-mono">{'{member}'}</code> for the owner&rsquo;s name.
        </p>
        {rows.length === 0 ? <p className="text-muted-foreground text-sm">No standing missions. Add the ones you create every month.</p> : null}
        <ul>
          {rows.map((row, index) => {
            const label = row.titlePattern || 'standing mission';
            const owner = row.owner === 'each' ? sample : row.owner === 'director' ? 'Managing director' : members.find((m) => m.id === row.owner)?.fullName ?? 'Owner';
            return (
              <li key={row.id} className={cn('border-border grid gap-3 border-b py-4 last:border-b-0', !row.active && 'opacity-60')}>
                <div className="flex items-start gap-2">
                  <label className="field-label min-w-0 flex-1">
                    Title
                    <input value={row.titlePattern} onChange={(event) => update(index, { titlePattern: event.target.value })} maxLength={200} required autoComplete="off" placeholder="HRC Tasks - {month}…" className="field" />
                  </label>
                  <span className="mt-6 flex items-center gap-1">
                    <OrderButtons index={index} count={rows.length} label={label} onMove={(delta) => moveBy(index, delta)} />
                    <RemoveButton label={label} onRemove={() => remove(index)} />
                  </span>
                </div>
                <p className="text-muted-foreground -mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span className={CODE}>{formatSheetTag(example, row.category, 'n')}</span>
                  <span className="min-w-0 break-words">{renderTitlePattern(row.titlePattern || '…', example, owner)}</span>
                </p>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,1.3fr)_minmax(0,1fr)_auto] lg:items-end">
                  <label className="field-label">
                    Mission type
                    <select value={row.category} onChange={(event) => update(index, { category: event.target.value as TaskCategory })} className="field">
                      {TASK_CATEGORIES.map((code) => (
                        <option key={code} value={code}>
                          {code} · {labels[code]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    Priority
                    <select value={row.priority} onChange={(event) => update(index, { priority: event.target.value as TaskPriority })} className="field">
                      {TASK_PRIORITIES.map((priority) => (
                        <option key={priority}>{priority}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    Owner
                    <select value={row.owner} onChange={(event) => update(index, { owner: event.target.value })} className="field">
                      <option value="each">One for each member</option>
                      <option value="director">Managing director (at setup)</option>
                      {row.owner !== 'each' && row.owner !== 'director' && !active.some((m) => m.id === row.owner) ? (
                        <option value={row.owner}>{members.find((m) => m.id === row.owner)?.fullName ?? 'Former member'} (no access)</option>
                      ) : null}
                      {active.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.fullName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    Weight from
                    <select value={row.scaleMode} onChange={(event) => update(index, { scaleMode: event.target.value as StandingScaleMode })} className="field">
                      {(Object.keys(SCALE_LABELS) as StandingScaleMode[]).map((mode) => (
                        <option key={mode} value={mode}>
                          {SCALE_LABELS[mode]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="col-span-2 lg:col-span-1 lg:pb-2.5">
                    <InUse checked={row.active} label={label} onChange={(checked) => update(index, { active: checked })} />
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        <AddRowButton
          label="Add standing mission"
          onAdd={() => add({ id: crypto.randomUUID(), titlePattern: '', category: 'T', priority: 'Medium', owner: 'each', scaleMode: 'hours', active: true })}
        />
      </SectionForm>
    </MissionPanel>
  );
}

/* -------------------------------------------------------------------------- */
/* Holidays                                                                   */
/* -------------------------------------------------------------------------- */

interface HolidayRow {
  key: string;
  date: string;
  name: string;
}

const WEEKDAY = new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone: 'UTC' });

function HolidaysSection({ settings }: SectionProps) {
  const initial = React.useMemo<HolidayRow[]>(() => settings.holidays.map((h) => ({ key: h.date, ...h })), [settings.holidays]);
  const { rows, dirty, reset, update, remove, add } = useRows(initial);
  const weekday = (date: string) => (ISO_DATE_PATTERN.test(date) ? WEEKDAY.format(new Date(`${date}T00:00:00Z`)) : '');
  return (
    <MissionPanel
      id="holidays"
      icon={CalendarDaysIcon}
      title="Holiday calendar"
      subtitle="On these dates, attendance saved without a status is recorded as Holiday, and the Team index marks the day H. Attendance already recorded is never changed."
      className="scroll-mt-20"
    >
      <SectionForm
        section="holidays"
        version={settings.version}
        dirty={dirty}
        onDiscard={reset}
        payload={() => ({ holidays: rows.map(({ date, name }) => ({ date, name })) })}
      >
        {rows.length === 0 ? <p className="text-muted-foreground text-sm">No holidays yet. Until you save one, attendance always needs a status.</p> : null}
        <ul>
          {rows.map((row, index) => (
            <li key={row.key} className={cn(ROW, 'grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto]')}>
              <label className="flex items-center gap-2">
                <span className="sr-only">Date</span>
                <input type="date" value={row.date} onChange={(event) => update(index, { date: event.target.value })} required className="field w-full" />
                <span className="text-muted-foreground w-8 shrink-0 text-xs max-sm:hidden" aria-hidden="true">
                  {weekday(row.date)}
                </span>
              </label>
              <label className="grid min-w-0">
                <span className="sr-only">Holiday name</span>
                <input value={row.name} onChange={(event) => update(index, { name: event.target.value })} maxLength={120} required placeholder="Diwali…" autoComplete="off" className="field" />
              </label>
              <RemoveButton label={row.name || row.date || 'holiday'} onRemove={() => remove(index)} />
            </li>
          ))}
        </ul>
        <AddRowButton label="Add holiday" onAdd={() => add({ key: crypto.randomUUID(), date: '', name: '' })} />
      </SectionForm>
    </MissionPanel>
  );
}
