'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CheckIcon, LoaderCircleIcon, MinusIcon } from 'lucide-react';
import { toast } from 'sonner';

import { prepareOperation } from '@/shared/commands/client-operation';
import { cn } from '@/shared/utils';
import { commandVersion } from '../internal/table';
import type { CompletionState } from '../internal/progress';
import type { ActionResponse } from '@/types/tracker';

type Command = (form: FormData) => Promise<ActionResponse<unknown>>;

interface VersionQueue {
  /** The mission version every checklist form on the page should send. */
  version: number;
  /** Runs commands one at a time, each with the latest version. */
  run: (send: (version: number) => Promise<number | null>) => Promise<void>;
}

const VersionContext = React.createContext<VersionQueue | null>(null);

/**
 * Every checklist command bumps the mission's version and refuses a stale one,
 * so several quick taps on different rows would collide. The provider runs
 * them in order and hands each the version the previous one returned.
 */
export function ChecklistVersionProvider({ version, children }: { version: number; children: React.ReactNode }) {
  const latest = React.useRef(version);
  const chain = React.useRef<Promise<void>>(Promise.resolve());
  const [current, setCurrent] = React.useState(version);

  // A refresh brings the server's version; never step backwards.
  React.useEffect(() => {
    if (version > latest.current) {
      latest.current = version;
      setCurrent(version);
    }
  }, [version]);

  const run = React.useCallback<VersionQueue['run']>((send) => {
    const next = chain.current.then(async () => {
      const reported = await send(latest.current);
      if (reported !== null && reported > latest.current) {
        latest.current = reported;
        setCurrent(reported);
      }
    }).catch(() => undefined);
    chain.current = next;
    return next;
  }, []);

  const value = React.useMemo(() => ({ version: current, run }), [current, run]);
  return <VersionContext.Provider value={value}>{children}</VersionContext.Provider>;
}

/** The current mission version for hidden form fields, falling back to the server value. */
export function useChecklistVersion(fallback: number): number {
  return React.useContext(VersionContext)?.version ?? fallback;
}

/** Hidden `expectedVersion` that follows the page's version queue. */
export function ChecklistVersionField({ fallback }: { fallback: number }) {
  return <input type="hidden" name="expectedVersion" value={useChecklistVersion(fallback)} />;
}

const CHOICE_STYLE: Record<CompletionState, string> = {
  Yes: 'aria-pressed:bg-success-strong aria-pressed:text-white',
  No: 'aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-(--shadow-card)',
  'N/A': 'aria-pressed:bg-primary-subtle aria-pressed:text-primary-subtle-foreground',
};

/**
 * One-tap Yes / No / N/A for a checklist row (the sheet's Checkbox column).
 * The chosen state shows at once; a refused change puts the old state back
 * and says why.
 */
export function ChecklistStateControl({
  taskId,
  checklistId,
  nodeId,
  title,
  state,
  choices,
  version,
  action,
}: {
  taskId: string;
  checklistId: string;
  nodeId: string;
  title: string;
  state: CompletionState;
  choices: readonly CompletionState[];
  version: number;
  action: Command;
}) {
  const router = useRouter();
  const queue = React.useContext(VersionContext);
  const [shown, setShown] = React.useState(state);
  const [pending, setPending] = React.useState(false);

  // The saved state wins once the page refreshes.
  React.useEffect(() => setShown(state), [state]);

  async function choose(next: CompletionState) {
    if (next === shown || pending) return;
    const previous = shown;
    setShown(next);
    setPending(true);

    const send = async (expected: number): Promise<number | null> => {
      const form = new FormData();
      form.set('command', 'state');
      form.set('checklist_id', checklistId);
      form.set('taskId', taskId);
      form.set('expectedVersion', String(expected));
      form.set('node_id', nodeId);
      form.set('state', next);
      try {
        const settle = await prepareOperation(form, `state:${nodeId}`);
        const result = await action(form);
        // A refusal is a definite answer, so the pending key is spent either way.
        settle();
        if (!result.success) {
          setShown(previous);
          toast.error(`“${title}” was not updated`, { description: result.error });
          return null;
        }
        router.refresh();
        return commandVersion(result.data);
      } catch {
        // The key stays so tapping again recovers a change that did save.
        setShown(previous);
        toast.error(`“${title}” may not have been saved`, { description: 'The connection was interrupted. Tap the same choice again.' });
        return null;
      } finally {
        setPending(false);
      }
    };

    if (queue) await queue.run(send);
    else await send(version);
  }

  return (
    <div
      role="group"
      aria-label={`Completion of ${title}`}
      aria-busy={pending || undefined}
      className="bg-muted inline-flex shrink-0 items-center gap-0.5 rounded-lg p-0.5"
    >
      {choices.map((choice) => (
        <button
          key={choice}
          type="button"
          aria-pressed={shown === choice}
          disabled={pending && shown !== choice}
          onClick={() => choose(choice)}
          className={cn(
            'text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex h-7 min-w-9 items-center justify-center gap-1 rounded-md px-2 text-xs font-semibold transition-colors outline-none focus-visible:ring-2 disabled:opacity-50',
            CHOICE_STYLE[choice],
          )}
        >
          {pending && shown === choice ? <LoaderCircleIcon className="size-3 animate-spin" aria-hidden="true" /> : null}
          {choice}
        </button>
      ))}
    </div>
  );
}

/** Read-only completion for viewers who cannot change it. */
export function ChecklistStateBadge({ state }: { state: CompletionState }) {
  if (state === 'Yes') {
    return <span className="text-success-strong inline-flex items-center gap-1 text-xs font-semibold"><CheckIcon className="size-3.5" aria-hidden="true" />Yes</span>;
  }
  if (state === 'N/A') {
    return <span className="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold"><MinusIcon className="size-3.5" aria-hidden="true" />N/A</span>;
  }
  return <span className="text-muted-foreground text-xs font-semibold">No</span>;
}
