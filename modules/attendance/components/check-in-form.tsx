'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CameraIcon, CheckCircle2Icon, LoaderCircleIcon, MapPinIcon, MapPinOffIcon, RefreshCwIcon } from 'lucide-react';

import { checkIn } from '@/modules/attendance/check-in-actions';
import { compressPhoto, mapEmbed, type CheckInKind, type CheckInMark } from '@/modules/attendance/client';
import { BUSINESS_TIME_ZONE } from '@/shared/time/kolkata';
import { Button } from '@/shared/ui/button';
import { MissionNotice } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';

const CLOCK = new Intl.DateTimeFormat('en-IN', { timeZone: BUSINESS_TIME_ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
const DAY = new Intl.DateTimeFormat('en-GB', { timeZone: BUSINESS_TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

type Position = { latitude: number; longitude: number; accuracy: number };
type Located = { state: 'finding' } | { state: 'found'; position: Position } | { state: 'none'; reason: string };

/** Metres between two positions (the database computes the same for the record). */
function metresBetween(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function ReadOnly({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      {label ? <span className="text-foreground text-sm font-medium">{label}</span> : null}
      <div className="border-border bg-muted/40 text-muted-foreground min-h-11 rounded-xl border px-3 py-2.5 text-base tabular-nums">{children}</div>
    </div>
  );
}

/**
 * The phone check-in screen (the sheet's AppSheet form): email, date and time
 * fill themselves, the phone shares its position, and the employee only takes
 * a photo. The time saved is the server's, not this clock's.
 */
export function CheckInForm({ kind, email, office, todayIn, backHref }: {
  kind: CheckInKind;
  email: string;
  office: { latitude: number; longitude: number; radiusM: number } | null;
  /** Check-out shows when the day started. */
  todayIn: CheckInMark | null;
  backHref: string;
}) {
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);
  const [located, setLocated] = useState<Located>({ state: 'finding' });
  const [photo, setPhoto] = useState<{ blob: Blob; preview: string } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ time: string; message: string } | null>(null);
  const [saving, startSaving] = useTransition();
  // Kept across a retry of the same photo, so a lost response replays instead of saving twice.
  const ids = useRef({ operationId: '', photoId: '' });
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const locate = () => {
    if (!('geolocation' in navigator)) return setLocated({ state: 'none', reason: 'This phone cannot share its location.' });
    setLocated({ state: 'finding' });
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setLocated({ state: 'found', position: { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy } }),
      failure => setLocated({ state: 'none', reason: failure.code === failure.PERMISSION_DENIED ? 'Location is blocked for this site. You can still save; the check-in will say “no location”.' : 'The location could not be found. Try again, or save without it.' }),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
    );
  };
  useEffect(locate, []);

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.preview); }, [photo]);

  const takePhoto = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setPreparing(true);
    try {
      const blob = await compressPhoto(file);
      ids.current = { operationId: crypto.randomUUID(), photoId: crypto.randomUUID() };
      setPhoto({ blob, preview: URL.createObjectURL(blob) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The photo could not be read. Take it again.');
    } finally {
      setPreparing(false);
      if (input.current) input.current.value = '';
    }
  };

  const save = () => {
    if (!photo) return;
    setError(null);
    const form = new FormData();
    form.set('kind', kind);
    form.set('operationId', ids.current.operationId);
    form.set('photoId', ids.current.photoId);
    form.set('photo', new File([photo.blob], 'photo.jpg', { type: 'image/jpeg' }));
    if (located.state === 'found') {
      form.set('latitude', String(located.position.latitude));
      form.set('longitude', String(located.position.longitude));
      form.set('accuracy', String(located.position.accuracy));
    }
    startSaving(async () => {
      try {
        const result = await checkIn(form);
        if (!result.success || !result.data) {
          setError(result.error ?? 'The check-in was not saved.');
          // A refused check-in will not change on a resend; a new photo starts a new attempt.
          if (result.errorCode === 'conflict') ids.current = { operationId: crypto.randomUUID(), photoId: crypto.randomUUID() };
          return;
        }
        const data = result.data;
        const time = CLOCK.format(new Date(data.capturedAt));
        const where = data.outsideOffice ? ` You were about ${data.distanceM} m from the office, so it is marked “outside office”.` : '';
        const message = kind === 'in'
          ? `Checked in at ${time}. Check out from here when you leave.${where}`
          : data.recordExists
            ? `Checked out at ${time}. Today already had an attendance record, so it was left as it is.${where}`
            : `Checked out at ${time}. Today is recorded as Present, ${data.hours} h.${where}`;
        setDone({ time, message });
        router.refresh();
      } catch {
        setError('The connection dropped. Tap Save again; the same check-in will not be saved twice.');
      }
    });
  };

  if (done) {
    return (
      <div className="grid gap-4">
        <MissionNotice tone="info" icon={CheckCircle2Icon} role="status">{done.message}</MissionNotice>
        <Button asChild variant="outline" className="justify-self-start"><Link href={backHref}>Done</Link></Button>
      </div>
    );
  }

  const distance = office && located.state === 'found' ? Math.round(metresBetween(office, located.position)) : null;
  return (
    <div className="grid gap-5">
      <ReadOnly label="Email">{email}</ReadOnly>
      <div className="grid grid-cols-2 gap-3">
        <ReadOnly label="Date">{now ? DAY.format(now) : '…'}</ReadOnly>
        <ReadOnly label={kind === 'in' ? 'Login time' : 'Logout time'}>{now ? CLOCK.format(now) : '…'}</ReadOnly>
      </div>
      {todayIn ? <p className="text-muted-foreground -mt-2 text-sm">Checked in today at {todayIn.time}.</p> : null}

      <div className="grid gap-1.5">
        <span className="text-foreground text-sm font-medium">Photo <span className="text-primary" aria-hidden="true">*</span></span>
        <label className={cn('border-border hover:bg-muted/60 focus-within:ring-ring relative grid min-h-40 cursor-pointer place-items-center overflow-hidden rounded-xl border-2 border-dashed focus-within:ring-2',
          photo && 'border-solid')}>
          <input ref={input} type="file" accept="image/*" capture="user" className="sr-only" onChange={event => void takePhoto(event.target.files?.[0])} aria-label="Take a photo" />
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local preview of the photo just taken
            <img src={photo.preview} alt="Your check-in photo" className="max-h-80 w-full object-contain" />
          ) : preparing ? (
            <LoaderCircleIcon className="text-muted-foreground size-8 animate-spin" aria-hidden="true" />
          ) : (
            <span className="text-muted-foreground grid justify-items-center gap-1 text-sm">
              <CameraIcon className="size-9" aria-hidden="true" />
              Tap to take a photo
            </span>
          )}
        </label>
        {photo ? (
          <button type="button" className="link inline-flex items-center gap-1.5 justify-self-start text-sm" onClick={() => input.current?.click()}>
            <RefreshCwIcon className="size-4" aria-hidden="true" />Retake
          </button>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <span className="text-foreground text-sm font-medium">{kind === 'in' ? 'Login location' : 'Logout location'}</span>
        {located.state === 'found' ? (
          <>
            <ReadOnly label="">
              <span className="inline-flex items-center gap-1.5"><MapPinIcon className="size-4" aria-hidden="true" />
                {located.position.latitude.toFixed(6)}, {located.position.longitude.toFixed(6)}</span>
              <span className="block text-xs">Within about {Math.round(located.position.accuracy)} m
                {distance !== null ? ` · ${distance} m from the office${office && distance > office.radiusM ? ' (outside the office area)' : ''}` : ''}</span>
            </ReadOnly>
            <iframe title="Your location on a map" src={mapEmbed(located.position.latitude, located.position.longitude)} className="border-border h-48 w-full rounded-xl border" loading="lazy" />
          </>
        ) : located.state === 'finding' ? (
          <p className="text-muted-foreground inline-flex items-center gap-2 text-sm"><LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />Finding your location…</p>
        ) : (
          <div className="grid gap-2">
            <p className="text-muted-foreground inline-flex items-start gap-2 text-sm"><MapPinOffIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{located.reason}</p>
            <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={locate}>Try again</Button>
          </div>
        )}
      </div>

      {error ? <MissionNotice tone="danger" role="alert">{error}</MissionNotice> : null}
      <div className="grid grid-cols-2 gap-3">
        <Button asChild variant="outline" size="lg"><Link href={backHref}>Cancel</Link></Button>
        <Button type="button" size="lg" onClick={save} disabled={!photo || saving || preparing}>
          {saving ? <LoaderCircleIcon className="animate-spin" aria-hidden="true" /> : null}
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
