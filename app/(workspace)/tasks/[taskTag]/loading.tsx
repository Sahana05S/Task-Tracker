import { PageSkeleton } from '@/shared/ui/page-skeleton';

/**
 * One mission (and its checklist pages): shown at once while the page or a tab loads, instead of the
 * Missions grid placeholder or nothing (6 November 2026, speed).
 */
export default function MissionLoading() {
  return <PageSkeleton label="Loading mission" panels={['h-40', 'h-72']} />;
}
