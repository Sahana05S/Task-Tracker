// PRIVATE. Server-side streak read: RPC day codes + the pure rule.
import { readActivityDays } from './queries';
import { parseRecognitionPolicy } from './policy';
import { computeStreak, type StreakSummary } from './rules';

/** The approved active-day streak for one member, as of today in Asia/Kolkata. */
export async function getStreak(userId: string): Promise<StreakSummary> {
  const model = await readActivityDays(userId);
  const policy = parseRecognitionPolicy(model.policy);
  const member = model.members.find((m) => m.userId === userId);
  if (!member) throw new Error('Streak unavailable for this member.');
  return computeStreak(member.days, model.from, userId, { milestones: policy.milestones, ruleVersion: policy.ruleVersion });
}
