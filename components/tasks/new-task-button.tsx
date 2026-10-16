import Link from 'next/link';
import { PlusIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Opens the create-mission form from the page header.
 *
 * A link to `?new=1` rather than a button wired to shared state. The dialog lives
 * inside `TaskWorkspace`, which is a sibling of the header, and a query parameter
 * is both simpler than threading context and deep-linkable — `/tasks?new=1` opens
 * the form directly.
 *
 * Rendered only for roles that may create tasks; the Server Action re-checks
 * regardless, since a hidden button is not access control.
 */
export function NewTaskButton() {
  return (
    <Button asChild className="h-10 rounded-xl px-4">
      <Link href="/tasks?new=1" scroll={false}>
        <PlusIcon aria-hidden="true" />
        New mission
      </Link>
    </Button>
  );
}
