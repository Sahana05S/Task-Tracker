import { PageSkeleton } from '@/shared/ui/page-skeleton';

/** Hall of fame: the viewer's points, the trophy case and everyone's points. */
export default function HallOfFameLoading() {
  return <PageSkeleton label="Loading the hall of fame" panels={['h-48', 'h-64', 'h-96']} />;
}
