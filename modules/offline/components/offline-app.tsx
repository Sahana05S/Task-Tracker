'use client';

// The Android app's offline page (/offline), served from the service worker's
// cache when there is no connection. It reads only the phone's offline copy;
// it must never import a Server Action (a cached page from an older build
// would carry stale action ids). __tests__/architecture/offline-page.test.ts
// checks this.

import { useCallback, useEffect, useState } from 'react';
import { CircleDashedIcon, CircleSlashIcon, CheckIcon, ChevronRightIcon, RefreshCwIcon, TimerIcon, WifiOffIcon, XIcon } from 'lucide-react';

import { missionDueLabel } from '@/modules/tasks/client';
import { Button } from '@/shared/ui/button';
import { StellarMark } from '@/shared/ui/stellar-mark';
import { cn } from '@/shared/utils';

import { asOfLabel, childRows, dayLabel, OFFLINE_SECTIONS, type OfflineMission, type OfflineRow, type OfflineSection, type StoredSnapshot } from '@/modules/offline/internal/rules';
import { readSnapshot } from '@/modules/offline/internal/store';

const SECTION_LABEL: Record<OfflineSection, string> = { setup: 'Setup', activity: 'Activity', closure: 'Closure' };
const PROBE_URL = '/sw.js';
const PROBE_TIMEOUT_MS = 3000;

/** True when the site answers: the phone is back online. */
async function siteReachable(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(PROBE_URL, { cache: 'no-store', signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Where to go back to: the page that failed to load, if it is an in-app path, else Today. */
function returnPath(): string {
  const from = new URLSearchParams(window.location.search).get('from');
  return from && /^\/[A-Za-z0-9/_-]{0,199}$/.test(from) && !from.startsWith('//') && from !== '/offline' ? from : '/today';
}

function StateMark({ state, applicable }: { readonly state: OfflineRow['state']; readonly applicable: boolean }) {
  if (!applicable || state === 'N/A') return <CircleSlashIcon className="text-muted-foreground size-4 shrink-0" aria-label="Not applicable" />;
  if (state === 'Yes') return <CheckIcon className="text-success size-4 shrink-0" aria-label="Yes" />;
  if (state === 'No') return <XIcon className="text-destructive size-4 shrink-0" aria-label="No" />;
  return <CircleDashedIcon className="text-muted-foreground size-4 shrink-0" aria-label="Not ticked" />;
}

function RowList({ rows, section, parent }: { readonly rows: readonly OfflineRow[]; readonly section: OfflineSection; readonly parent: string | null }) {
  const items = childRows(rows, section, parent);
  if (!items.length) return null;
  return (
    <ul className={cn('flex flex-col', parent && 'border-border ml-2 border-l pl-3')}>
      {items.map((row) => {
        const label = (
          <span className="flex min-w-0 items-center gap-2 py-1.5">
            {row.childCount > 0 ? <span className="text-muted-foreground font-mono text-[11px]">{row.progress === null ? '—' : `${Math.round(row.progress)}%`}</span> : <StateMark state={row.state} applicable={row.applicable} />}
            <span className="truncate text-sm">{row.title}</span>
            {row.linkedTaskTag && <span className="text-muted-foreground font-mono text-[11px]">{row.linkedTaskTag}</span>}
          </span>
        );
        return (
          <li key={row.id}>
            {row.childCount > 0 && childRows(rows, section, row.id).length > 0 ? (
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-1">
                  <ChevronRightIcon className="text-muted-foreground size-3.5 shrink-0 transition-transform group-open:rotate-90" aria-hidden="true" />
                  {label}
                </summary>
                <RowList rows={rows} section={section} parent={row.id} />
              </details>
            ) : (
              <span className="flex items-center gap-1 pl-[1.125rem]">{label}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function MissionCard({ mission, today }: { readonly mission: OfflineMission; readonly today: string }) {
  const sections = OFFLINE_SECTIONS.filter((section) => childRows(mission.rows, section, null).length > 0);
  return (
    <details className="bg-card border-border rounded-lg border">
      <summary className="flex cursor-pointer list-none items-start gap-3 p-3">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-muted-foreground font-mono text-[11px]">{mission.taskTag} · {mission.status}</span>
          <span className="text-foreground text-sm font-semibold">{mission.title}</span>
          <span className="text-muted-foreground text-xs">{missionDueLabel(mission.dueDate, today)}</span>
        </span>
        <span className="text-foreground font-mono text-sm font-semibold">{mission.progress === null ? '—' : `${Math.round(mission.progress)}%`}</span>
      </summary>
      <div className="border-border flex flex-col gap-3 border-t p-3">
        {sections.length === 0 && <p className="text-muted-foreground text-sm">No checklist saved for this mission.</p>}
        {sections.map((section) => (
          <section key={section} className="flex flex-col gap-1">
            <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{SECTION_LABEL[section]}</h3>
            <RowList rows={mission.rows} section={section} parent={null} />
          </section>
        ))}
        {mission.checklistPartial && <p className="text-muted-foreground text-xs">Only part of this checklist is saved on the phone.</p>}
      </div>
    </details>
  );
}

/** The offline page: the member's missions as last saved, and a way back once the connection returns. */
export function OfflineApp() {
  const [snapshot, setSnapshot] = useState<StoredSnapshot | null | undefined>(undefined);
  const [checking, setChecking] = useState(false);

  const tryAgain = useCallback(async () => {
    setChecking(true);
    if (await siteReachable()) {
      window.location.assign(returnPath());
      return;
    }
    setChecking(false);
  }, []);

  useEffect(() => {
    void readSnapshot().then(setSnapshot);
    const onOnline = () => void tryAgain();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [tryAgain]);

  const today = snapshot?.kolkataDate ?? '';
  return (
    <main className="bg-background text-foreground mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 px-4 pt-[max(1rem,var(--safe-area-inset-top,env(safe-area-inset-top)))] pb-8">
      <header className="flex items-center gap-3">
        <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg">
          <StellarMark className="size-5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <WifiOffIcon className="size-4" aria-hidden="true" /> No connection
          </span>
          <span className="text-muted-foreground text-xs">
            {snapshot ? asOfLabel(snapshot.receivedAt, snapshot.clockOffsetMs) : 'Offline copy'}
          </span>
        </span>
        <Button variant="outline" size="sm" onClick={() => void tryAgain()} disabled={checking}>
          <RefreshCwIcon className={cn('size-4', checking && 'animate-spin')} aria-hidden="true" />
          {checking ? 'Checking' : 'Try again'}
        </Button>
      </header>

      {snapshot === null && (
        <section className="bg-card border-border rounded-lg border p-4 text-sm">
          <p className="font-semibold">Nothing saved for offline use yet.</p>
          <p className="text-muted-foreground mt-1">
            Open Stellar once with a connection and with Offline mode (beta) on in the account menu. Your missions are then kept on this phone.
          </p>
        </section>
      )}

      {snapshot && (
        <>
          <section className="bg-card border-border flex flex-col gap-2 rounded-lg border p-3 text-sm">
            <p>
              Hello {snapshot.fullName.split(' ')[0]}. This is your copy from {asOfLabel(snapshot.receivedAt, snapshot.clockOffsetMs).replace(/^As of /, '')}.
              Changes made since then by others are not shown.
            </p>
            {snapshot.checkInEnabled && (() => {
              const day = dayLabel(snapshot.kolkataDate, Date.now(), snapshot.clockOffsetMs);
              const on = day === 'today' ? 'today' : `on ${day}`;
              return (
                <p className="text-muted-foreground">
                  {snapshot.checkIns.in
                    ? `Checked in at ${snapshot.checkIns.in.time}${snapshot.checkIns.out ? `, out at ${snapshot.checkIns.out.time}` : ''} ${on}.`
                    : `Not checked in ${on} when this copy was saved.`}
                </p>
              );
            })()}
            {snapshot.runningTimers.map((timer) => (
              <p key={timer.id} className="flex items-center gap-1.5">
                <TimerIcon className="text-primary size-4" aria-hidden="true" />
                Timer running on <span className="font-mono text-xs">{timer.taskTag}</span> since{' '}
                {new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date(timer.startedAt))}
              </p>
            ))}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">My missions</h2>
            {snapshot.missions.length === 0 && <p className="text-muted-foreground text-sm">No open missions were assigned to you.</p>}
            {snapshot.missions.map((mission) => <MissionCard key={mission.id} mission={mission} today={today} />)}
            {snapshot.missionsPartial && <p className="text-muted-foreground text-xs">Only your first {snapshot.missions.length} missions are saved on the phone.</p>}
          </section>
        </>
      )}
    </main>
  );
}
