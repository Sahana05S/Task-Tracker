import { PageSkeleton } from '@/shared/ui/page-skeleton';

/** Team index: the live view, the support figures and the member table. */
export default function TeamLoading() {
  return <PageSkeleton label="Loading the team index" tiles={5} panels={['h-40', 'h-96']} />;
}
