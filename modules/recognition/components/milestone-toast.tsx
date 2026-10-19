'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

/**
 * Celebrates a streak milestone once: when the current streak sits exactly on
 * a milestone and today has counted, a toast fires and the milestone is
 * remembered in this browser so it is not repeated on the next visit.
 * Renders nothing; the StreakCard states the same fact in text.
 */
export function MilestoneToast({ userId, current, todayCounted, lastActiveDate, milestones }: {
  userId: string; current: number; todayCounted: boolean; lastActiveDate: string | null; milestones: readonly number[];
}) {
  useEffect(() => {
    if (!todayCounted || !milestones.includes(current) || !lastActiveDate) return;
    const key = `tp.milestone.${userId}.${current}.${lastActiveDate}`;
    try {
      if (window.localStorage.getItem(key)) return;
      window.localStorage.setItem(key, '1');
    } catch {
      return;
    }
    toast(`${current}-day streak!`, {
      description: 'Present and logging work, day after day. Milestone reached.',
      icon: <span aria-hidden="true">🔥</span>,
      duration: 6000,
    });
  }, [userId, current, todayCounted, lastActiveDate, milestones]);
  return null;
}
