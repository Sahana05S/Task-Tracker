'use client';

import * as React from 'react';
import { FolderInputIcon } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { Field } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/shared/ui/sheet';
import { moveBlockedReason, type MoveTarget } from '../client';
import { ChecklistVersionField } from './checklist-state-control';
import { QuestOwnerSelect } from './quest-owner';
import type { ActionResponse } from '@/types/tracker';

type Command = (form: FormData) => Promise<ActionResponse<unknown>>;

/** The mission's lists, built on the server (`getMoveTargets`, migration 133); null offers no move. */
const MoveTargetsContext = React.createContext<readonly MoveTarget[] | null>(null);

export function MoveTargetsProvider({ targets, children }: { targets: readonly MoveTarget[] | null; children: React.ReactNode }) {
  return <MoveTargetsContext.Provider value={targets}>{children}</MoveTargetsContext.Provider>;
}

/**
 * Row menu: "Move to Quest…" (migration 133). A sheet lists the mission's main list and every
 * Quest as an indented tree with its owner, plus "New Quest…" made in the row's current list.
 * Lists the viewer may not change, the row's own list and the row's own Quests are shown disabled
 * with the reason. The database checks all of it again.
 */
export function MoveToQuestSection({ row, taskId, version, action }: {
  row: { id: string; checklistId: string; title: string; ownedChecklistId?: string | null };
  taskId: string;
  version: number;
  action: Command;
}) {
  const targets = React.useContext(MoveTargetsContext);
  const [open, setOpen] = React.useState(false);
  const [choice, setChoice] = React.useState('');
  if (!targets?.length) return null;
  const id = (name: string) => `row-${row.id}-move-${name}`;
  const here = targets.find((target) => target.checklistId === row.checklistId);
  return (
    <Sheet open={open} onOpenChange={(next) => { setOpen(next); if (!next) setChoice(''); }}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm"><FolderInputIcon aria-hidden="true" />Move to Quest…</Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="pr-12">
          <p className="text-muted-foreground text-xs font-semibold">Move to Quest</p>
          <SheetTitle className="text-foreground text-lg font-bold tracking-tight break-words">{row.title}</SheetTitle>
          <SheetDescription className="text-muted-foreground">
            It goes to the end of the list you choose{row.ownedChecklistId ? ', with everything inside it' : ''}. Its time, reviews and notes stay with it.
          </SheetDescription>
        </SheetHeader>
        <ExecutionForm action={action} scope={`move:${row.id}`} className="min-h-0 flex-1 overflow-y-auto px-5 py-5" onSuccess={() => setOpen(false)}>
          <input type="hidden" name="command" value="move" />
          <input type="hidden" name="checklist_id" value={row.checklistId} />
          <input type="hidden" name="taskId" value={taskId} />
          <input type="hidden" name="node_id" value={row.id} />
          <ChecklistVersionField fallback={version} />
          <fieldset className="grid gap-1">
            <legend className="text-foreground mb-2 text-sm font-bold">Move into</legend>
            {targets.map((target) => {
              const blocked = moveBlockedReason(target, row);
              return (
                <label
                  key={target.checklistId}
                  htmlFor={id(target.checklistId)}
                  style={{ paddingLeft: `${0.75 + Math.min(target.depth, 8) * 1}rem` }}
                  className={`flex items-start gap-3 rounded-lg py-2 pr-3 ${blocked ? 'opacity-60' : 'hover:bg-muted cursor-pointer'}`}
                >
                  <input
                    id={id(target.checklistId)}
                    type="radio"
                    name="target_list_id"
                    value={target.checklistId}
                    disabled={!!blocked}
                    checked={choice === target.checklistId}
                    onChange={() => setChoice(target.checklistId)}
                    className="mt-1"
                  />
                  <span className="grid min-w-0">
                    <span className="text-foreground text-sm font-semibold break-words">{target.nodeId ? target.title : 'Main list'}</span>
                    <span className="text-muted-foreground text-xs">
                      {blocked ?? (target.nodeId ? (target.ownerName ? `Owner: ${target.ownerName}` : 'Quest') : 'The mission’s own list')}
                    </span>
                  </span>
                </label>
              );
            })}
            <label htmlFor={id('new')} className={`flex items-start gap-3 rounded-lg px-3 py-2 ${here?.canEdit === false ? 'opacity-60' : 'hover:bg-muted cursor-pointer'}`}>
              <input id={id('new')} type="radio" name="target_list_id" value="new" disabled={here?.canEdit === false}
                checked={choice === 'new'} onChange={() => setChoice('new')} className="mt-1" />
              <span className="grid min-w-0">
                <span className="text-foreground text-sm font-semibold">New Quest…</span>
                <span className="text-muted-foreground text-xs">Made in this row’s list{here?.nodeId ? ` (${here.title})` : ''}, then the row moves into it</span>
              </span>
            </label>
          </fieldset>
          {choice === 'new' ? (
            <div className="mt-3 grid gap-3">
              <Field id={id('title')} label="Quest title" required>
                <Input id={id('title')} name="new_quest_title" required maxLength={500} autoFocus />
              </Field>
              <Field id={id('owner')} label="Owner">
                <QuestOwnerSelect id={id('owner')} name="new_quest_assignee_id" />
              </Field>
            </div>
          ) : null}
          <Button type="submit" className="mt-4 justify-self-start" disabled={!choice}>Move here</Button>
        </ExecutionForm>
      </SheetContent>
    </Sheet>
  );
}
