'use client';

import Link from 'next/link';
import { CalendarPlusIcon, EllipsisIcon } from 'lucide-react';

import { monthBounds, type MonthKey } from '@/modules/tasks/internal/tools/month-setup';
import { Button } from '@/shared/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu';
import { MissionNotice } from '@/shared/ui/mission-ui';

const setupHref = (month: MonthKey) => `/tasks/setup?month=${month}`;

/** The Missions page menu (managers): month setup lives here. */
export function MissionsPageMenu({ setupMonth }: { setupMonth: MonthKey }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="icon" aria-label="More mission actions">
          <EllipsisIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={setupHref(setupMonth)}>
            <CalendarPlusIcon aria-hidden="true" />
            Set up {monthBounds(setupMonth).label}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** From the 25th while next month has no missions. */
export function MonthSetupBanner({ month }: { month: MonthKey }) {
  const { label, name } = monthBounds(month);
  return (
    <MissionNotice tone="info" icon={CalendarPlusIcon} role="status">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p>
          <span className="text-foreground font-semibold">{name} has no missions yet.</span>{' '}
          Set up the standing missions, weekly phases and last month’s follow-ups in one step.
        </p>
        <Button asChild size="sm">
          <Link href={setupHref(month)}>Set up {label}</Link>
        </Button>
      </div>
    </MissionNotice>
  );
}
