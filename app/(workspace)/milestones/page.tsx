import type { Metadata } from 'next';
import { TargetIcon } from 'lucide-react';

import { SectionPlaceholder } from '@/components/layout/section-placeholder';

export const metadata: Metadata = {
  title: 'Milestones · TaskPulse',
};

export default function MilestonesPage() {
  return (
    <SectionPlaceholder
      title="Vision, Mission & Milestones"
      description="Organisational vision, mission statements, core values and monthly milestone targets."
      icon={TargetIcon}
      phase="Phase 5"
    />
  );
}
