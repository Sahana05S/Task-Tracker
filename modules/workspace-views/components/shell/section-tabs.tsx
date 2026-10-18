'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { activeSection, isTabActive } from '@/modules/workspace-views/components/shell/nav-items';
import { cn } from '@/shared/utils';

/**
 * Sub-navigation for grouped destinations (Missions, Records, Team). Hidden for
 * single-page destinations. Scrolls horizontally on narrow screens instead of
 * wrapping or widening the page.
 */
export function SectionTabs() {
  const pathname = usePathname();
  const section = activeSection(pathname);
  if (!section || section.tabs.length < 2) return null;
  return (
    <nav aria-label={`${section.label} sections`} className="border-border border-b bg-white/60">
      <div className="flex gap-1 overflow-x-auto px-4 py-2 lg:px-6">
        {section.tabs.map((tab) => {
          const active = isTabActive(pathname, tab);
          return (
            <Link key={tab.href} href={tab.href} aria-current={active ? 'page' : undefined}
              className={cn('section-tab', active && 'section-tab-active')}>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
