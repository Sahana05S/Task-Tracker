// PUBLIC server-side API of the milestones module.
export {
  getMilestonesPageData,
  MILESTONES_MIGRATION,
  type MilestonesPageData,
} from '@/modules/milestones/internal/queries';
export {
  milestoneCompletion,
  openMilestoneCount,
  sortMilestones,
  summariseMilestones,
  type MilestoneSummary,
} from '@/modules/milestones/internal/goals';
