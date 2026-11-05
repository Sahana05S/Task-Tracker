'use client';

import { useState } from 'react';
import { CameraIcon, MessageCircleIcon } from 'lucide-react';

import type { CheckInKind, CheckInMark } from '@/modules/attendance/client';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import { CheckInForm } from './check-in-form';
import { CheckInShare } from './check-in-share';

const BUTTON = 'bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:outline-primary inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold';

/**
 * Check in and out from Today: the button opens the same check-in form as
 * `/attendance/check-in` (photo and location rules unchanged) in a sheet.
 * After a save the sheet shows the drafted message and WhatsApp opens with it;
 * once the day is checked out the button offers the daily report again.
 */
export function CheckInCard({ email, office, todayIn, todayOut, share }: {
  email: string;
  office: { latitude: number; longitude: number; radiusM: number } | null;
  todayIn: CheckInMark | null;
  todayOut: CheckInMark | null;
  share: { kind: CheckInKind; text: string; title: string } | null;
}) {
  const [open, setOpen] = useState(false);
  // A save in this sheet: keep its confirmation and show the drafted message under it.
  const [savedKind, setSavedKind] = useState<CheckInKind | null>(null);
  const saved = savedKind !== null;
  const kind: CheckInKind | null = !todayIn ? 'in' : !todayOut ? 'out' : null;
  if (!kind && !share) return null;
  const label = kind === 'in' ? 'Check in' : kind === 'out' ? `Check out (in at ${todayIn!.time})` : 'Share your day';
  const title = savedKind ? (savedKind === 'out' ? 'Checked out' : 'Checked in') : kind === 'in' ? 'Check in' : kind === 'out' ? 'Check out' : 'Share your day';
  const change = (next: boolean) => { setOpen(next); if (!next) setSavedKind(null); };
  return (
    <>
      <button type="button" className={BUTTON} onClick={() => change(true)}>
        {kind ? <CameraIcon className="size-4" aria-hidden="true" /> : <MessageCircleIcon className="size-4" aria-hidden="true" />}
        {label}
      </button>
      <Sheet open={open} onOpenChange={change}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md" autoFocusField={false}>
          <SheetHeader className="pr-12">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>
              {kind || saved ? 'Take a photo when you arrive and when you leave. The time and place are filled in for you.' : 'Your daily report, ready to send. WhatsApp asks who to send it to.'}
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-6 px-4 pb-6">
            {kind || saved ? (
              <CheckInForm kind={kind ?? 'out'} email={email} office={office} todayIn={todayIn} backHref="/today"
                onClose={() => change(false)} onSaved={() => setSavedKind(kind ?? 'out')} />
            ) : null}
            {share && (savedKind ? share.kind === savedKind : !kind) ? <CheckInShare kind={share.kind} text={share.text} title={share.title} /> : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
