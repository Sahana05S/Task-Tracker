import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeftIcon } from 'lucide-react';

import { addMonths, canManageTasks, defaultSetupMonth, getMonthSetupContext, monthOf } from '@/modules/tasks';
import { MonthSetupWizard } from '@/modules/tasks/components/month-setup/month-setup-wizard';
import { requireProfile } from '@/shared/session/profile';
import { kolkataDate } from '@/shared/time/kolkata';
import { MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';

export const metadata: Metadata = {
  title: 'Set up a month · TaskPulse',
};

/**
 * Month setup wizard (managing director and project engineer). Loads the
 * current and next month together so switching between them is instant; the
 * database re-checks the role and the month on every call.
 */
export default async function MonthSetupPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const profile = await requireProfile();
  if (!canManageTasks(profile.role)) redirect('/tasks');

  const today = kolkataDate();
  const current = monthOf(today);
  const [query, contexts] = await Promise.all([
    searchParams,
    Promise.all([getMonthSetupContext(current), getMonthSetupContext(addMonths(current, 1))]),
  ]);
  const requested = contexts.find((context) => context.month === query.month)?.month;
  const initialMonth = requested ?? defaultSetupMonth(today, contexts[0].existingCount > 0);

  return (
    <MissionPage>
      <MissionPageHeader
        title="Set up a month"
        description="Create the month’s standing missions, weekly review phases and follow-ups from last month in one go."
        breadcrumb={
          <Link href="/tasks" className="link inline-flex w-fit items-center gap-1.5 text-sm">
            <ArrowLeftIcon className="size-4" aria-hidden="true" /> Missions
          </Link>
        }
      />
      <MonthSetupWizard contexts={contexts} initialMonth={initialMonth} />
    </MissionPage>
  );
}
