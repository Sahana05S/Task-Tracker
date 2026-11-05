import { LockIcon } from 'lucide-react';

import { MissionNotice } from '@/shared/ui/mission-ui';

/**
 * Shown instead of the checklist and work content to members who are not one
 * of the mission's people (4 November 2026, migration 117): the database
 * returns no rows to them, so an empty checklist would be misleading.
 */
export function MissionWorkPrivate({ className }: { className?: string }) {
  return (
    <MissionNotice icon={LockIcon} role="status" className={className}>
      <p className="font-semibold">This checklist is private to the mission&apos;s people</p>
      <p className="text-muted-foreground mt-1">
        Its crew, reviewers and observers, and the managing director, can see the checklist, details and files.
      </p>
    </MissionNotice>
  );
}
