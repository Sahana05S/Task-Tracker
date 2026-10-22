'use client';

import Link from 'next/link';
import { RotateCcwIcon, TriangleAlertIcon } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import { EmptyState, MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';

/**
 * A page that failed to load, inside the workspace shell and theme. The
 * failure is stated as such (never as an empty page); the reference code lets
 * the owner find the server log line.
 */
export default function WorkspaceError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <MissionPage>
      <MissionPageHeader title="This page didn’t load" description="Nothing you saved earlier is lost." />
      <EmptyState
        icon={TriangleAlertIcon}
        title="Something went wrong while reading this page"
        action={
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Button onClick={() => retry()}>
              <RotateCcwIcon aria-hidden="true" />
              Try again
            </Button>
            <Button variant="outline" asChild>
              <Link href="/today">Go to Today</Link>
            </Button>
          </div>
        }
      >
        Try again in a moment. If it keeps happening, tell your managing director
        {error.digest ? <> and quote reference <span className="text-foreground font-mono">{error.digest}</span></> : null}.
      </EmptyState>
    </MissionPage>
  );
}
