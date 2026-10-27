'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ListIcon, NetworkIcon } from 'lucide-react';

import { SegmentedControl, type SegmentedOption } from '@/shared/ui/segmented-control';

export type TeamView = 'list' | 'chart';

const OPTIONS: readonly SegmentedOption<TeamView>[] = [
  { value: 'chart', label: 'Chart', icon: NetworkIcon },
  { value: 'list', label: 'List', icon: ListIcon },
];

/** The People page's Chart / List switch, kept in the URL as `?view=list` (the org chart is the default, 28 Oct 2026). */
export function TeamViewSwitch({ view }: { view: TeamView }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (
    <SegmentedControl
      label="Team view"
      value={view}
      options={OPTIONS}
      onValueChange={next => {
        const params = new URLSearchParams(searchParams.toString());
        if (next === 'list') params.set('view', 'list');
        else params.delete('view');
        const search = params.toString();
        router.push(search ? `${pathname}?${search}` : pathname);
      }}
    />
  );
}
