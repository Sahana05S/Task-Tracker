'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2Icon, PenLineIcon } from 'lucide-react';
import { toast } from 'sonner';

import { acknowledgeConduct, publishConduct } from '@/modules/hr/conduct-actions';
import { CONDUCT_BODY_MAX, CONDUCT_TITLE_MAX } from '@/modules/hr/client';
import { formatDateTime } from '@/shared/tracker/format';
import { Button } from '@/shared/ui/button';
import { MissionPanel } from '@/shared/ui/mission-ui';

function formData(values: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

/** "I have read and accept": the signed-in member accepts the version on screen. */
export function ConductAcceptance({ version, acknowledgedAt }: { version: number; acknowledgedAt: string | null }) {
  const router = useRouter();
  const [saving, start] = useTransition();
  if (acknowledgedAt) {
    return (
      <p className="no-print text-success-strong flex items-center gap-1.5 text-sm font-medium">
        <CheckCircle2Icon aria-hidden="true" className="size-4" />
        You accepted version {version} on {formatDateTime(acknowledgedAt)}.
      </p>
    );
  }
  return (
    <div className="no-print border-border bg-card flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
      <p className="text-foreground text-sm">Please read the Code of Conduct below, then accept it.</p>
      <Button
        type="button"
        disabled={saving}
        onClick={() => start(async () => {
          const result = await acknowledgeConduct(formData({ version: String(version), operationId: crypto.randomUUID() }));
          if (!result.success) return void toast.error(result.error ?? 'Not saved.');
          toast.success('Thank you. Your acceptance is recorded.');
          router.refresh();
        })}
      >
        <CheckCircle2Icon aria-hidden="true" />
        I have read and accept
      </Button>
    </div>
  );
}

/**
 * The managing director's editor: publishing makes a new version that every
 * member is asked to accept again. Opens on the starter draft before the first.
 */
export function ConductEditor({ version, title: savedTitle, body: savedBody }: {
  /** The published version being edited; 0 when none. */
  version: number;
  title: string;
  body: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(savedTitle);
  const [body, setBody] = useState(savedBody);
  const [saving, start] = useTransition();
  const changed = version === 0 || title !== savedTitle || body !== savedBody;
  return (
    <MissionPanel
      icon={PenLineIcon}
      title={version ? 'Edit the Code of Conduct' : 'Publish the Code of Conduct'}
      subtitle={version
        ? `Publishing makes version ${version + 1}; everyone is asked to accept it again.`
        : 'This is a starting draft: review every line for your company, then publish. Nothing is shared until you do.'}
      className="no-print"
    >
      <div className="grid gap-3">
        <label className="field-label">
          Title
          <input className="field" value={title} maxLength={CONDUCT_TITLE_MAX} onChange={event => setTitle(event.target.value)} />
        </label>
        <label className="field-label">
          Text
          <textarea className="field min-h-80 font-mono text-sm" value={body} maxLength={CONDUCT_BODY_MAX} onChange={event => setBody(event.target.value)} />
        </label>
        <p className="text-muted-foreground text-xs">Start a line with &quot;# &quot; for a heading and &quot;- &quot; for a bullet. Leave a blank line between paragraphs.</p>
        <div className="flex flex-wrap justify-end gap-2">
          {version && changed ? (
            <Button type="button" variant="outline" disabled={saving} onClick={() => { setTitle(savedTitle); setBody(savedBody); }}>
              Discard changes
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={saving || !changed || !title.trim() || !body.trim()}
            onClick={() => start(async () => {
              const result = await publishConduct(formData({ version: String(version), title, body, operationId: crypto.randomUUID() }));
              if (!result.success) return void toast.error(result.error ?? 'Not published.');
              toast.success(`Version ${result.data?.version} published.`);
              router.refresh();
            })}
          >
            Publish{version ? ` version ${version + 1}` : ''}
          </Button>
        </div>
      </div>
    </MissionPanel>
  );
}
