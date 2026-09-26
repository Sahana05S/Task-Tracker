import type { Metadata } from 'next';
import { ClockIcon } from 'lucide-react';

import { SectionPlaceholder } from '@/components/layout/section-placeholder';

export const metadata: Metadata = {
  title: 'Logs · TaskPulse',
};

export default function LogsPage() {
  return (
    <SectionPlaceholder
      title="Daily Effort & Progress Logs"
      description="Hours worked, incremental progress deltas, update notes and links to raw assets, with automatic recalculation of task progress and productivity."
      icon={ClockIcon}
      phase="Phase 4"
    />
  );
}
