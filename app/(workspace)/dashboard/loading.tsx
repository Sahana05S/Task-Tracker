import { PageSkeleton } from '@/shared/ui/page-skeleton';

/** Team performance: title, the figure tiles, then the two chart panels. */
export default function DashboardLoading() {
  return <PageSkeleton label="Loading team performance" wide tiles={5} panels={['h-80', 'h-80']} panelColumns={2} />;
}
