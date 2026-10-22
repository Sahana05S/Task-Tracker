'use client';

import { useEffect, useState, useTransition } from 'react';
import { MoreHorizontalIcon, PencilIcon, PlayIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';

import { evaluateNowAction, policyResultsAction, setPolicyStateAction, type ResultRow } from '@/modules/policies/actions';
import { outcomeLabel } from '@/modules/policies/client';
import { OUTCOME_COLORS } from '@/modules/policies/components/outcome-strip';
import { PolicyDialog, type DialogMember, type EditablePolicy } from '@/modules/policies/components/policy-dialog';

type StateCommand = 'activate' | 'deactivate' | 'archive';

const STATE_COPY: Record<StateCommand, { title: string; body: string; action: string }> = {
  deactivate: { title: 'Pause this policy?', body: 'Nobody is judged by it while it is paused. Results so far and commendations stay.', action: 'Pause policy' },
  activate: { title: 'Resume this policy?', body: 'It is judged again from tonight, and the last 62 days are checked once more.', action: 'Resume policy' },
  archive: { title: 'Archive this policy?', body: 'It disappears from the list and cannot be resumed. Commendations already earned stay, and its name can be used again.', action: 'Archive policy' },
};

function ResultsSheet({ open, onOpenChange, policyId, periodKey, title }: {
  open: boolean; onOpenChange: (open: boolean) => void; policyId: string; periodKey: string; title: string;
}) {
  const [rows, setRows] = useState<ResultRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  // Read when the sheet opens (the menu opens it, so Radix reports no change here).
  useEffect(() => {
    if (!open) return;
    setRows(null);
    setError(null);
    startLoading(async () => {
      const response = await policyResultsAction(policyId, periodKey);
      if (response.success) { setRows(response.data ?? []); setError(null); } else setError(response.error ?? 'Results are not available.');
    });
  }, [open, policyId, periodKey]);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="mb-2">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>Each member’s result for this period and the main reason.</SheetDescription>
        </SheetHeader>
        <div className="px-5 pb-6" aria-busy={loading}>
          {error ? <p role="alert" className="text-danger text-sm">{error}</p>
            : !rows ? <p className="text-muted-foreground text-sm">Loading results…</p>
              : !rows.length ? <p className="text-muted-foreground text-sm">Not evaluated yet. Use Evaluate now, or wait for tonight’s run.</p>
                : (
                  <table className="w-full text-sm">
                    <caption className="sr-only">Results by member</caption>
                    <thead><tr className="text-muted-foreground text-left text-xs"><th scope="col" className="py-2 font-medium">Member</th><th scope="col" className="py-2 font-medium">Result</th></tr></thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.employeeId} className="border-border border-t align-top">
                          <td className="text-foreground py-2 pr-3 font-medium">{row.name}</td>
                          <td className="py-2">
                            <span className="inline-flex items-center gap-1.5">
                              <span aria-hidden="true" className="size-2 rounded-full"
                                style={{ backgroundColor: OUTCOME_COLORS[row.outcome === 'not_met' ? 'notMet' : row.outcome] }} />
                              {outcomeLabel(row.outcome, row.final)}
                            </span>
                            {row.withdrawn ? <span className="text-attention-foreground block text-xs">Commendation withdrawn after a correction</span> : null}
                            {row.reason ? <span className="text-muted-foreground block text-xs">{row.reason}</span> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function StateSheet({ command, onOpenChange, policy }: { command: StateCommand | null; onOpenChange: (open: boolean) => void; policy: EditablePolicy }) {
  const copy = command ? STATE_COPY[command] : null;
  return (
    <Sheet open={command !== null} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full gap-0 pb-[env(safe-area-inset-bottom)] sm:bottom-6 sm:max-w-md sm:rounded-3xl">
        <SheetHeader>
          <SheetTitle>{copy?.title}</SheetTitle>
          <SheetDescription>{policy.name}. {copy?.body}</SheetDescription>
        </SheetHeader>
        {command ? (
          <ExecutionForm action={setPolicyStateAction} scope={`policy-state:${policy.id}:${command}`} onSuccess={() => onOpenChange(false)} className="px-5 py-5">
            <input type="hidden" name="command" value={command} />
            <input type="hidden" name="policyId" value={policy.id} />
            <input type="hidden" name="expectedVersion" value={policy.version} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant={command === 'archive' ? 'destructive' : 'default'}>{copy?.action}</Button>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            </div>
          </ExecutionForm>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/** The managing director's actions on one policy row. */
export function PolicyRowActions({ policy, active, periodKey, members }: {
  policy: EditablePolicy; active: boolean; periodKey: string; members: DialogMember[];
}) {
  const [editing, setEditing] = useState(false);
  const [results, setResults] = useState(false);
  const [state, setState] = useState<StateCommand | null>(null);
  const [evaluating, startEvaluating] = useTransition();

  function evaluateNow() {
    startEvaluating(async () => {
      const form = new FormData();
      form.set('policyId', policy.id);
      const response = await evaluateNowAction(form);
      if (response.success && response.data) {
        const { evaluated, changed } = response.data;
        toast.success(`${policy.name}: ${evaluated} results checked, ${changed} changed.`);
      } else {
        toast.error(response.error ?? 'The evaluation failed.');
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {active ? (
        <Button type="button" variant="ghost" size="sm" className="max-md:h-10" onClick={evaluateNow} disabled={evaluating} aria-label={evaluating ? `Evaluating: ${policy.name}` : `Evaluate now: ${policy.name}`}>
          <PlayIcon aria-hidden="true" />{evaluating ? 'Evaluating…' : 'Evaluate now'}
        </Button>
      ) : null}
      <Button type="button" variant="ghost" size="sm" className="max-md:h-10" onClick={() => setEditing(true)} aria-label={`Edit: ${policy.name}`}>
        <PencilIcon aria-hidden="true" />Edit
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger className="icon-button size-8 max-md:size-10" aria-label={`More actions for ${policy.name}`}>
          <MoreHorizontalIcon className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => setResults(true)}>See results</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setState(active ? 'deactivate' : 'activate')}>{active ? 'Pause' : 'Resume'}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setState('archive')} variant="destructive">Archive</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <PolicyDialog open={editing} onOpenChange={setEditing} policy={policy} members={members} />
      <ResultsSheet open={results} onOpenChange={setResults} policyId={policy.id} periodKey={periodKey} title={`${policy.name}: results`} />
      <StateSheet command={state} onOpenChange={(open) => { if (!open) setState(null); }} policy={policy} />
    </div>
  );
}

/** "New policy" in the page header. */
export function NewPolicyButton({ members }: { members: DialogMember[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>New policy</Button>
      <PolicyDialog open={open} onOpenChange={setOpen} policy={null} members={members} />
    </>
  );
}
