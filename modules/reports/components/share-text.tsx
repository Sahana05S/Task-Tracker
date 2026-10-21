'use client';

import { useEffect, useState } from 'react';
import { CheckIcon, CopyIcon, Share2Icon } from 'lucide-react';

import { Button } from '@/shared/ui/button';

/**
 * The daily report as the message the member sends: a preview bubble with
 * Copy, plus Share (the phone's share sheet) where the browser offers it.
 */
export function ShareText({ text, title }: { text: string; title: string }) {
  const [canShare, setCanShare] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function'), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus('Copied. Paste it into WhatsApp.');
    } catch {
      setStatus('Copy is blocked here. Select the message and copy it.');
    }
  }

  async function share() {
    try {
      await navigator.share({ title, text });
      setStatus('');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setStatus('Sharing failed. Use Copy instead.');
    }
  }

  return (
    <div className="grid gap-3">
      <pre
        tabIndex={0}
        aria-label="Message preview"
        className="bg-success-subtle text-foreground border-success-strong/15 max-h-[26rem] overflow-auto rounded-2xl rounded-tr-sm border px-4 py-3 font-sans text-[13px] leading-relaxed break-words whitespace-pre-wrap"
      >
        <BoldText text={text} />
      </pre>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={copy} className="gap-1.5">
          {status.startsWith('Copied') ? <CheckIcon className="size-4" aria-hidden="true" /> : <CopyIcon className="size-4" aria-hidden="true" />}
          Copy text
        </Button>
        {canShare ? (
          <Button type="button" variant="outline" onClick={share} className="gap-1.5">
            <Share2Icon className="size-4" aria-hidden="true" />
            Share
          </Button>
        ) : null}
        <p role="status" className="text-muted-foreground text-xs">{status}</p>
      </div>
    </div>
  );
}

/** Shows WhatsApp *bold* runs as bold, the way the recipient will see them. */
function BoldText({ text }: { text: string }) {
  return text.split(/(\*[^*\n]+\*)/g).map((part, index) =>
    part.startsWith('*') && part.endsWith('*') && part.length > 2 ? <strong key={index}>{part.slice(1, -1)}</strong> : part,
  );
}
