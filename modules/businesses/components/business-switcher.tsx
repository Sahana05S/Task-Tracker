'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

import {
  BUSINESS_PARAM,
  businessParamValue,
  type Business,
  type BusinessSelection,
  type BusinessSummary,
} from '@/modules/businesses/client';
import { BusinessChips } from '@/modules/businesses/components/business-chips';

/**
 * Business chips for a page that reads `?business=` on the server (Today): a press keeps every other
 * query value, sets `?business=` and reloads the page's data.
 */
export function BusinessSwitcher({ businesses, selection, summary, className }: {
  businesses: readonly Business[];
  selection: BusinessSelection;
  summary?: BusinessSummary | null;
  className?: string;
}) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  return (
    <div aria-busy={pending} className={pending ? 'opacity-70 transition-opacity' : undefined}>
      <BusinessChips
        businesses={businesses}
        selection={selection}
        summary={summary}
        className={className}
        onChange={(next) => {
          const query = new URLSearchParams(params.toString());
          query.set(BUSINESS_PARAM, businessParamValue(next, businesses));
          start(() => router.push(`${path}?${query}`, { scroll: false }));
        }}
      />
    </div>
  );
}
