import Link from 'next/link';
import { Button } from '@/shared/ui/button';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { CHECKLIST_SECTIONS, checklistWorkHref, formatMinutes, openChecklistRow, type ChecklistBranch, type ChecklistBranchOptions, type ChecklistItemTime } from '../client';
import { CommandFields, CompletionForm, ItemTimerControls, ReasonInput, RowDetailFields, FIELD, LABEL, percentage } from './checklist-rows';
import { checklistHref } from '../client';
import { ChecklistCreateForm } from './checklist-create-form';
import type { ActionResponse, Task } from '@/types/tracker';

type Command = (form: FormData) => Promise<ActionResponse<unknown>>;
// Unstarted or empty sections have no percentage; say why instead of "Unavailable".
const sectionLabel = (s: ChecklistBranch['rollup']['sections']['activity']) =>
  s.state === 'missing' || s.state === 'uninitialized' ? 'Not started'
    : s.state === 'not_applicable' ? (s.isComplete ? 'Confirmed empty' : 'No items') : percentage(s.progressPercentage);
export function ChecklistWorkspace({ task, branch, location, manager, executor, canTime, time, actions }: {
  task: Task; branch: ChecklistBranch; location: ChecklistBranchOptions & { item?: string };
  manager: boolean; executor: boolean; canTime: boolean; time?: ChecklistItemTime;
  actions: { checklist: Command; start: Command; stop: Command; discard: Command };
}) {
  const checklist = branch.checklist;
  const open = !task.archivedEffectiveDate && !['Done', 'Discarded'].includes(task.status);
  const ctx = { task: { ...task, lifecycleVersion: branch.taskVersion }, checklistId: checklist?.id, action: actions.checklist };
  const selected = branch.rows.find(row => row.id === location.item);
  const address = { checklistId: checklist?.id, parentNodeId: branch.parentNodeId ?? undefined, section: branch.section };
  return <div className="mx-auto grid w-full max-w-[1200px] gap-5 px-4 py-6 lg:px-6">
    <nav aria-label="Checklist breadcrumb" className="flex flex-wrap items-center gap-2 text-sm">
      <Link className="underline underline-offset-4" href={`/tasks/${encodeURIComponent(task.taskTag)}`}>{task.taskTag}</Link>
      <span aria-hidden="true">/</span><Link className="underline underline-offset-4" href={checklistWorkHref(task.taskTag)}>Master checklist</Link>
      {branch.ancestors.map(ancestor => <span key={ancestor.nodeId} className="flex items-center gap-2">
        <span aria-hidden="true">/</span><Link className="underline underline-offset-4" href={checklistWorkHref(task.taskTag, ancestor.ownedChecklistId
          ? { checklistId: ancestor.ownedChecklistId, section: 'activity' }
          : { checklistId: ancestor.checklistId, parentNodeId: ancestor.nodeId, section: branch.section })}>{ancestor.title}</Link>
      </span>)}
    </nav>
    <header className="grid gap-2">
      <h1 className="text-2xl font-bold break-words">{checklist?.title ?? 'Master checklist'}</h1>
      <p className="text-muted-foreground text-sm">{task.title} · Activity {percentage(branch.rollup.taskProgress)} · {branch.rollup.isComplete ? 'Checklist gates satisfied' : 'Checklist gates pending'}</p>
      {checklist?.ownerNodeId ? <p className="text-muted-foreground text-sm">Sub-mission owners and deadline follow the mission. Time is recorded on the mission once.</p> : null}
    </header>
    {checklist ? <>
      <nav aria-label="Checklist sections" className="flex flex-wrap gap-2">
        {CHECKLIST_SECTIONS.map(section => <Button key={section} asChild variant={section === branch.section ? 'default' : 'outline'}>
          <Link aria-current={section === branch.section ? 'page' : undefined} href={checklistWorkHref(task.taskTag, { checklistId: checklist.id, section })}>
            <span className="capitalize">{section}</span><span>{sectionLabel(branch.rollup.sections[section])}</span>
          </Link>
        </Button>)}
      </nav>
      {branch.rollup.errors.length ? <ul role="alert" className="text-destructive list-disc pl-5 text-sm">{branch.rollup.errors.map((error, index) => <li key={index}>{error}</li>)}</ul> : null}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-label="Checklist items" className="min-w-0">
          <ul className="divide-border divide-y">
            {branch.rows.map(row => {
              const container = row.isSubMission || row.childCount > 0 || ['Page', 'Group'].includes(row.nodeType);
              const href = checklistWorkHref(task.taskTag, container ? openChecklistRow(row) : { ...address, cursor: location.cursor }, container ? undefined : row.id);
              return <li key={row.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0"><Link href={href} className="font-semibold break-words underline underline-offset-4">{row.title}</Link>
                  <p className="text-muted-foreground mt-1 text-xs">{row.isSubMission ? 'Sub-mission' : container ? 'Page' : 'Item'} · {percentage(row.progressPercentage)} · {row.isComplete ? 'Complete' : 'Pending'}{row.priority ? ` · Priority ${row.priority}` : ''}</p>
                </div>
                {!container && executor && open ? <CompletionForm ctx={ctx} node={row} className="min-w-0" /> : null}
                {executor && open && !row.linkedTaskId ? <RowManage ctx={ctx} row={row} /> : null}
              </li>;
            })}
          </ul>
          {!branch.rows.length ? <p className="text-muted-foreground py-5 text-sm">No items in this section yet.</p> : null}
          <nav aria-label="Checklist pages" className="mt-4 flex gap-3">
            {(location.cursor ?? 0) > 0 ? <Link className="underline" href={checklistWorkHref(task.taskTag, { ...address, cursor: Math.max(0, (location.cursor ?? 0) - 30) })}>Previous items</Link> : null}
            {branch.hasMore && branch.nextCursor !== null ? <Link className="underline" href={checklistWorkHref(task.taskTag, { ...address, cursor: branch.nextCursor })}>Next items</Link> : null}
          </nav>
          {selected ? <section aria-label={`Work on ${selected.title}`} className="border-border mt-6 grid gap-3 border-t pt-5">
            <h2 className="text-lg font-semibold">{selected.title}</h2>
            {selected.description ? <p className="whitespace-pre-wrap break-words text-sm">{selected.description}</p> : null}
            {selected.links.map((href, index) => <a key={`${href}:${index}`} href={href} target="_blank" rel="noopener noreferrer" className="text-sm break-all underline">Work link {index + 1}</a>)}
            {time && executor ? <ItemTimerControls ctx={{ task, open, time: { info: time, canStart: canTime, start: actions.start, stop: actions.stop, discard: actions.discard } }} node={selected} /> : null}
            {time && !time.available ? <p role="status" className="text-muted-foreground text-sm">Item time could not be loaded. Reload this item to retry.</p> : null}
            {time?.available ? <p className="text-sm">Logged time: {formatMinutes(Math.round((time.secondsByNode.get(selected.id) ?? 0) / 60))}</p> : null}
          </section> : location.item ? <p role="status" className="text-sm">This item is no longer in this batch. Open it again from its checklist.</p> : null}
        </section>
        <aside className="grid gap-5">
          {executor && open ? <section className="grid gap-3"><h2 className="font-semibold">Add work</h2>
            <ChecklistCreateForm key={`${checklist.id}:${branch.parentNodeId}:${branch.section}:${branch.rows.length}`} task={ctx.task} checklistId={checklist.id} parentId={branch.parentNodeId} section={branch.section} action={actions.checklist} />
          </section> : null}
          {manager && !checklist.ownerNodeId ? <Link className="text-primary text-sm font-semibold underline-offset-4 hover:underline" href={branch.parentNodeId ? checklistHref(task.taskTag, branch.parentNodeId) : checklistHref(task.taskTag)}>Progress owner, mapping and linked missions</Link> : null}
          {manager && open ? <details className="border-border border-t pt-4"><summary className="cursor-pointer font-semibold">Manage section</summary>
            <ExecutionForm action={actions.checklist} scope={`section:${checklist.id}:${branch.section}`} className="mt-3">
              <CommandFields ctx={ctx} command="section" /><input type="hidden" name="section" value={branch.section} />
              <label className={LABEL}>Section review<select name="intentional_empty" className={`${FIELD} h-10`}><option value="false">Confirm initialized work</option><option value="true">Confirm intentionally empty</option></select></label>
              <ReasonInput placeholder="Reason for section review" /><Button type="submit">Confirm section</Button>
            </ExecutionForm>
          </details> : null}
        </aside>
      </div>
    </> : executor && open ? <ExecutionForm action={actions.checklist} scope={`create:${task.id}`}>
      <CommandFields ctx={ctx} command="create" /><label className={LABEL}>Checklist title<input name="title" defaultValue="Master checklist" required className={`${FIELD} h-10`} /></label><Button type="submit">Create checklist</Button>
    </ExecutionForm> : <p>This mission has no checklist yet.</p>}
  </div>;
}

/** Contextual row changes: same edit/duplicate/remove commands as the structure page, without moving the row. */
function RowManage({ ctx, row }: { ctx: { task: Pick<Task, 'id' | 'taskTag' | 'lifecycleVersion'>; checklistId?: string; action: Command }; row: ChecklistBranch['rows'][number] }) {
  return <details className="text-sm sm:col-span-2">
    <summary className="text-muted-foreground hover:text-foreground w-fit cursor-pointer text-xs font-semibold">Manage</summary>
    <div className="mt-3 grid gap-4 border-l-2 pl-4">
      <ExecutionForm action={ctx.action} scope={`edit:${row.id}`}>
        <CommandFields ctx={{ ...ctx, checklistId: row.checklistId }} command="edit" />
        <input type="hidden" name="node_id" value={row.id} />
        <input type="hidden" name="section" value={row.section ?? ''} />
        <input type="hidden" name="parent_id" value={row.parentNodeId ?? ''} />
        <input type="hidden" name="linked_task_id" value="" />
        <input type="hidden" name="node_type" value={row.nodeType} />
        <label className={LABEL}>Title<input name="title" defaultValue={row.title} required maxLength={500} className={`${FIELD} h-10`} /></label>
        <RowDetailFields node={row} />
        <ReasonInput placeholder="Reason for this change" />
        <Button type="submit" variant="outline" size="sm" className="justify-self-start">Save changes</Button>
      </ExecutionForm>
      {!row.isSubMission ? <ExecutionForm action={ctx.action} scope={`duplicate:${row.id}`}>
        <CommandFields ctx={{ ...ctx, checklistId: row.checklistId }} command="duplicate" />
        <input type="hidden" name="node_id" value={row.id} />
        <Button type="submit" variant="outline" size="sm" className="justify-self-start">Duplicate{row.childCount ? ' with its items' : ''}</Button>
      </ExecutionForm> : null}
      {row.isSubMission ? <p className="text-muted-foreground text-xs">Sub-missions cannot be removed yet; mark their items N/A instead.</p>
        : row.childCount === 0 ? <ExecutionForm action={ctx.action} scope={`delete:${row.id}`}>
        <CommandFields ctx={{ ...ctx, checklistId: row.checklistId }} command="delete" />
        <input type="hidden" name="node_id" value={row.id} />
        <ReasonInput placeholder="Reason for removal" />
        <Button type="submit" variant="ghost" size="sm" className="justify-self-start text-rose-700 hover:text-rose-800">Remove item</Button>
      </ExecutionForm> : <p className="text-muted-foreground text-xs">Remove the items inside before removing this row.</p>}
    </div>
  </details>;
}
