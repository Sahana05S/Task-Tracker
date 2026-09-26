import type { Metadata } from 'next';
import { ListChecksIcon } from 'lucide-react';

import { SectionPlaceholder } from '@/components/layout/section-placeholder';

export const metadata: Metadata = {
  title: 'Tasks · TaskPulse',
};

export default function TasksPage() {
  return (
    <SectionPlaceholder
      title="Task Tracker"
      description="Dense operations grid with sortable headers, inline status and progress editing, and the assignee, category, priority, status and freshness filters."
      icon={ListChecksIcon}
      phase="Phase 3"
    />
  );
}
