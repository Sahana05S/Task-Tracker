'use client';

import * as React from 'react';
import { CheckIcon, LoaderCircleIcon, NotebookTextIcon, TriangleAlertIcon } from 'lucide-react';

import { MINUTES_MAX_LENGTH } from '@/modules/support/client';
import { saveMinutesAction } from '@/modules/support/meeting-actions';
import { Button } from '@/shared/ui/button';

type SaveState = 'saved' | 'dirty' | 'saving' | 'conflict' | 'error';
const AUTOSAVE_MS = 1500;

/**
 * A meeting's minutes (migration 136): one large text area, prefilled from the company agenda when
 * the meeting was created, saved automatically a moment after typing stops (and when the field
 * loses focus). Each save names the version it started from; if someone else saved in between,
 * nothing is overwritten and the member is asked to reload.
 */
export function MeetingMinutes({ meetingId, minutes, version, canEdit, savedLine }: {
  meetingId: string;
  minutes: string;
  version: number;
  canEdit: boolean;
  /** "Last saved by Asha, 7 Nov, 10:42" from the server. */
  savedLine: string | null;
}) {
  const [text, setText] = React.useState(minutes);
  const [state, setState] = React.useState<SaveState>('saved');
  const [error, setError] = React.useState<string | null>(null);
  const current = React.useRef({ version, saved: minutes, text: minutes, saving: false });
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // A refreshed page (someone added a point) brings newer minutes: take them unless typing.
  React.useEffect(() => {
    const ref = current.current;
    if (version > ref.version && ref.text === ref.saved) {
      ref.version = version;
      ref.saved = minutes;
      ref.text = minutes;
      setText(minutes);
      setState('saved');
    }
  }, [minutes, version]);

  const save = React.useCallback(async () => {
    const ref = current.current;
    if (timer.current) clearTimeout(timer.current);
    if (ref.saving || ref.text === ref.saved) return;
    ref.saving = true;
    const sending = ref.text;
    setState('saving');
    try {
      const result = await saveMinutesAction({ meetingId, minutes: sending, version: ref.version, operationId: crypto.randomUUID() });
      if (result.success && result.data) {
        ref.version = result.data.version;
        ref.saved = sending;
        setError(null);
        setState(ref.text === sending ? 'saved' : 'dirty');
      } else {
        setError(result.error ?? 'The minutes were not saved.');
        setState(result.errorCode === 'conflict' ? 'conflict' : 'error');
      }
    } catch {
      setError('The minutes were not saved. Check the connection.');
      setState('error');
    } finally {
      ref.saving = false;
    }
    // Typed while the save was on its way: save that too.
    if (current.current.text !== current.current.saved && timer.current === null) {
      timer.current = setTimeout(() => { timer.current = null; void save(); }, AUTOSAVE_MS);
    }
  }, [meetingId]);

  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  // Leaving with unsaved minutes asks first.
  React.useEffect(() => {
    if (state !== 'dirty' && state !== 'saving' && state !== 'error') return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [state]);

  function change(value: string) {
    current.current.text = value;
    setText(value);
    if (state === 'conflict') return;
    setState('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; void save(); }, AUTOSAVE_MS);
  }

  return (
    <section className="soft-card grid gap-3 p-5 sm:p-6" aria-labelledby="minutes-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="minutes-heading" className="text-foreground flex items-center gap-2 text-base font-bold tracking-tight">
          <NotebookTextIcon className="text-primary size-5" aria-hidden="true" />Minutes
        </h2>
        {canEdit ? <SaveIndicator state={state} /> : null}
      </div>
      {canEdit ? (
        <textarea
          value={text}
          onChange={(event) => change(event.target.value)}
          onBlur={() => void save()}
          maxLength={MINUTES_MAX_LENGTH}
          aria-label="Minutes"
          placeholder="What was discussed and decided"
          className="field min-h-72 font-[inherit] leading-relaxed sm:min-h-96"
        />
      ) : (
        <p className="text-foreground text-[15px] leading-relaxed whitespace-pre-wrap">{text || 'No minutes were written.'}</p>
      )}
      {state === 'conflict' || state === 'error' ? (
        <p role="alert" className="text-danger flex flex-wrap items-center gap-2 text-sm">
          <TriangleAlertIcon className="size-4" aria-hidden="true" />{error}
          {state === 'conflict' ? (
            <Button type="button" size="sm" variant="outline" onClick={() => {
              // Reloading replaces the text in this box, so ask first when it holds unsaved words.
              if (current.current.text === current.current.saved || window.confirm('Reload the newer minutes? Your unsaved text in this box will be replaced; copy it first if you need it.')) window.location.reload();
            }}>Reload</Button>
          ) : <Button type="button" size="sm" variant="outline" onClick={() => void save()}>Try again</Button>}
        </p>
      ) : savedLine ? <p className="text-muted-foreground text-xs">{savedLine}</p> : null}
    </section>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'saving') return <span role="status" className="text-muted-foreground inline-flex items-center gap-1 text-xs"><LoaderCircleIcon className="size-3.5 motion-safe:animate-spin" aria-hidden="true" />Saving…</span>;
  if (state === 'dirty') return <span role="status" className="text-muted-foreground text-xs">Unsaved changes</span>;
  if (state === 'saved') return <span role="status" className="text-success-strong inline-flex items-center gap-1 text-xs"><CheckIcon className="size-3.5" aria-hidden="true" />Saved</span>;
  return null;
}
