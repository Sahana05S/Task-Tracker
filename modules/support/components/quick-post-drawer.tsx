'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircleIcon } from 'lucide-react';
import { toast } from 'sonner';

import { loadPostChoices } from '@/modules/support/actions';
import { DatedRecordEditor } from '@/modules/support/components/dated-record-module';
import type { RecordKind } from '@/modules/support/internal/contract';
import type { PostChoices } from '@/modules/support/internal/post-choices';
import { FormError } from '@/shared/ui/form-field';
import { SegmentedControl, type SegmentedOption } from '@/shared/ui/segmented-control';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';

/** The five dated records a member can post, with the Records page that lists each. */
export const POST_KINDS: readonly (SegmentedOption<RecordKind> & { noun: string; href: string })[] = [
  { value: 'fact', label: 'Fact', noun: 'Fact', href: '/daily-facts' },
  { value: 'idea', label: 'Idea', noun: 'Idea', href: '/ideas' },
  { value: 'suggestion', label: 'Suggestion', noun: 'Suggestion', href: '/suggestions' },
  { value: 'sale', label: 'Sale', noun: 'Sale', href: '/sales' },
  { value: 'meeting', label: 'Meeting', noun: 'Meeting point', href: '/meeting-points' },
];

const STORAGE_KEY = 'taskpulse:quick-post-kind';

/** The kind last posted on this device; Fact the first time or when storage is unavailable. */
export function readLastPostKind(): RecordKind {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return POST_KINDS.some((kind) => kind.value === saved) ? (saved as RecordKind) : 'fact';
  } catch {
    return 'fact';
  }
}

export function rememberPostKind(kind: RecordKind) {
  try {
    window.localStorage.setItem(STORAGE_KEY, kind);
  } catch {
    // Private windows and blocked storage: the drawer simply opens on Fact next time.
  }
}

export interface QuickPostDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens on this kind instead of the last one used (a Records tab). */
  presetKind?: RecordKind;
  /** Preselects the related task (a mission page or card). */
  presetTaskId?: string;
  /** "Post another" in the success toast: reopen on the kind just posted. */
  onPostAnother?: (kind: RecordKind) => void;
}

/** What a successful post does: remember the kind, close the drawer, confirm with View / Post another. */
export function announcePosted(kind: RecordKind, { close, navigate, onPostAnother }: {
  close: () => void;
  navigate: (href: string) => void;
  onPostAnother?: (kind: RecordKind) => void;
}) {
  const meta = postKind(kind);
  rememberPostKind(kind);
  close();
  // The drawer closes on success, so the confirmation lives in a toast.
  toast.success(`${meta.noun} posted`, {
    description: 'It waits for review on the Records tab.',
    action: { label: 'View', onClick: () => navigate(meta.href) },
    cancel: onPostAnother ? {
      label: 'Post another',
      onClick: () => {
        // Sonner hands focus back to the page when its button blurs. Let that
        // happen now, before the drawer opens, or the drawer sees focus leave
        // and closes itself at once.
        (globalThis.document?.activeElement as HTMLElement | null)?.blur();
        onPostAnother(kind);
      },
    } : undefined,
  });
}

const postKind = (kind: RecordKind) => POST_KINDS.find((option) => option.value === kind)!;

/**
 * The drawer's body: the kind switch over the shared record editor. The
 * editor is keyed by kind, so each kind gets its own fields (sale and meeting
 * point add theirs) and its own command scope.
 */
export function QuickPostForm({ kind, onKindChange, choices, loadError, presetTaskId, onSaved, autoFocus = false }: {
  kind: RecordKind;
  onKindChange: (kind: RecordKind) => void;
  choices: PostChoices | null;
  loadError: string | null;
  presetTaskId?: string;
  onSaved: () => void;
  /** Focus the content field when the editor appears (on open, not after a kind switch). */
  autoFocus?: boolean;
}) {
  return (
    <>
      {/* Full width, and tighter segments on phones so all five kinds fit at 375 px. */}
      <SegmentedControl
        label="Record kind"
        value={kind}
        options={POST_KINDS}
        onValueChange={onKindChange}
        className="flex w-full [&>button]:flex-1 max-sm:[&>button]:px-1.5"
      />
      <div className="pt-4">
        {loadError ? (
          <FormError message={loadError} />
        ) : !choices ? (
          <p role="status" className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
            <LoaderCircleIcon className="size-4 motion-safe:animate-spin" aria-hidden="true" />
            Loading missions and members…
          </p>
        ) : (
          <DatedRecordEditor
            key={kind}
            kind={kind}
            members={choices.members}
            user={choices.user}
            tasks={choices.tasks}
            presetTaskId={presetTaskId}
            autoFocus={autoFocus}
            onSaved={onSaved}
            submitLabel={`Post ${postKind(kind).noun.toLowerCase()}`}
          />
        )}
      </div>
    </>
  );
}

/**
 * One drawer for posting any dated record: a kind switch over the same editor
 * and `writeDatedRecord` command the Records tabs use, so posts are pending
 * and validated there exactly as before. Members and open missions are read
 * when the drawer opens, as the Log time drawer reads its missions, because
 * the trigger is mounted on every workspace page.
 */
export function QuickPostDrawer({ open, onOpenChange, presetKind, presetTaskId, onPostAnother }: QuickPostDrawerProps) {
  const router = useRouter();
  const [kind, setKind] = React.useState<RecordKind>(() => presetKind ?? readLastPostKind());
  // Switching kind keeps focus on the switch; only the first editor takes it.
  const kindSwitched = React.useRef(false);
  const [choices, setChoices] = React.useState<PostChoices | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadError(null);
    loadPostChoices(presetTaskId)
      .then((result) => {
        if (cancelled) return;
        if (result.success && result.data) setChoices(result.data);
        else setLoadError(result.error ?? 'Missions and members could not be loaded.');
      })
      .catch(() => {
        if (!cancelled) setLoadError('Missions and members could not be loaded. Close the drawer and try again.');
      });
    return () => {
      cancelled = true;
    };
  }, [open, presetTaskId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] gap-0 sm:mx-auto sm:max-w-xl sm:rounded-t-xl">
        <SheetHeader>
          <SheetTitle>Post a record</SheetTitle>
          <SheetDescription>Posts wait for review, then count toward the month like any other record.</SheetDescription>
        </SheetHeader>
        <div className="overflow-y-auto px-5 py-5">
          <QuickPostForm
            kind={kind}
            onKindChange={(next) => {
              kindSwitched.current = true;
              setKind(next);
            }}
            autoFocus={!kindSwitched.current}
            choices={choices}
            loadError={loadError}
            presetTaskId={presetTaskId}
            onSaved={() => announcePosted(kind, { close: () => onOpenChange(false), navigate: (href) => router.push(href), onPostAnother })}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
