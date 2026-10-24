'use client';

import { useEffect, useState } from 'react';
import { CameraIcon, MapPinIcon } from 'lucide-react';

import { loadCheckInPhotos } from '@/modules/attendance/check-in-actions';
import { mapLink, type CheckInKind, type CheckInMark } from '@/modules/attendance/client';

/**
 * A day's photo check-in and check-out inside the cell editor: the times the
 * app recorded, where the phone was, and the photos (short-lived links,
 * fetched when the editor opens).
 */
export function CheckInEvidence({ memberId, date, marks }: { memberId: string; date: string; marks: readonly CheckInMark[] }) {
  const [photos, setPhotos] = useState<Partial<Record<CheckInKind, string>>>({});
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (!marks.some(mark => mark.hasPhoto)) return;
    void loadCheckInPhotos(memberId, date).then(result => {
      if (!live) return;
      if (result.success) setPhotos(Object.fromEntries((result.data ?? []).map(photo => [photo.kind, photo.url])));
      else setFailed(result.error ?? 'The photos could not be loaded.');
    });
    return () => { live = false; };
  }, [memberId, date, marks]);

  return (
    <section className="border-border grid gap-3 rounded-xl border p-3" aria-label="Photo check-in">
      <h3 className="text-foreground inline-flex items-center gap-1.5 text-sm font-semibold"><CameraIcon className="size-4" aria-hidden="true" />Photo check-in</h3>
      <div className="grid grid-cols-2 gap-3">
        {(['in', 'out'] as const).map(kind => {
          const mark = marks.find(item => item.kind === kind);
          return (
            <div key={kind} className="grid content-start gap-1.5 text-sm">
              <p className="font-medium">{kind === 'in' ? 'In' : 'Out'} {mark ? <span className="tabular-nums">{mark.time}</span> : <span className="text-muted-foreground">—</span>}</p>
              {mark ? (
                <>
                  {photos[kind] ? (
                    <a href={photos[kind]} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg">
                      {/* eslint-disable-next-line @next/next/no-img-element -- signed storage link, valid for a few minutes */}
                      <img src={photos[kind]} alt={`Check-${kind} photo`} className="aspect-[3/4] w-full object-cover" />
                    </a>
                  ) : (
                    <div className="bg-muted text-muted-foreground grid aspect-[3/4] place-items-center rounded-lg text-xs">{mark.hasPhoto ? (failed ? 'Photo unavailable' : 'Loading…') : 'Photo removed'}</div>
                  )}
                  {mark.latitude !== null && mark.longitude !== null ? (
                    <a href={mapLink(mark.latitude, mark.longitude)} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1 text-xs">
                      <MapPinIcon className="size-3.5" aria-hidden="true" />Map{mark.distanceM !== null ? ` · ${mark.distanceM} m from office` : ''}
                    </a>
                  ) : <p className="text-muted-foreground text-xs">No location shared</p>}
                  {mark.outsideOffice ? <span className="bg-attention-subtle text-attention-foreground justify-self-start rounded-full px-2 py-0.5 text-xs font-semibold">Outside office</span> : null}
                </>
              ) : null}
            </div>
          );
        })}
      </div>
      {failed ? <p className="text-muted-foreground text-xs">{failed}</p> : null}
    </section>
  );
}
