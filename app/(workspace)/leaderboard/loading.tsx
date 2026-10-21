import { PageSkeleton } from '@/shared/ui/page-skeleton';

/** Leaderboard: the podium and the ranked list. */
export default function LeaderboardLoading() {
  return <PageSkeleton label="Loading the leaderboard" panels={['h-56', 'h-96']} />;
}
