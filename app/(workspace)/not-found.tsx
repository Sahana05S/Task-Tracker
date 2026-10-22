import Link from 'next/link';
import { SearchXIcon } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import { EmptyState, MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';

/** A mission, record or member that does not exist or that this account cannot open. */
export default function WorkspaceNotFound() {
  return (
    <MissionPage>
      <MissionPageHeader title="Not found" description="The link may be old, or this account may not have access." />
      <EmptyState
        icon={SearchXIcon}
        title="There is nothing here"
        action={
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href="/today">Go to Today</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/tasks">Browse missions</Link>
            </Button>
          </div>
        }
      >
        Check the address, or open it again from the page that linked here.
      </EmptyState>
    </MissionPage>
  );
}
