'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ListIcon, NetworkIcon } from 'lucide-react';

import { SegmentedControl, type SegmentedOption } from '@/shared/ui/segmented-control';

export type TeamView = 'list' | 'chart';

const OPTIONS: readonly SegmentedOption<TeamView>[] = [
  { value: 'list', label: 'List', icon: ListIcon },
  { value: 'chart', label: 'Chart', icon: NetworkIcon },
];

/** The People page's List / Chart switch, kept in the URL as `?view=chart` (List is the default). */
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
        if (next === 'chart') params.set('view', 'chart');
        else params.delete('view');
        const search = params.toString();
        router.push(search ? `${pathname}?${search}` : pathname);
      }}
    />
  );
}
