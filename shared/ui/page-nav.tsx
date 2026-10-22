import Link from 'next/link';
import { ArrowLeftIcon } from 'lucide-react';

import { cn } from '@/shared/utils';

export interface BreadcrumbItem {
  label: string;
  /** Omitted on the current page. */
  href?: string;
  /** Render as a task-tag chip. */
  tag?: boolean;
  /** Hide on phones, for middle crumbs of a deep trail. */
  hideOnPhone?: boolean;
}

/** Square back control beside a breadcrumb. */
export function BackTile({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="text-muted-foreground hover:text-foreground hover:bg-muted bg-card flex size-9 shrink-0 items-center justify-center rounded-xl shadow-(--shadow-card) transition-colors"
    >
      <ArrowLeftIcon className="size-4" aria-hidden="true" />
    </Link>
  );
}

const TAG_CHIP = 'task-tag bg-primary-subtle text-primary-subtle-foreground rounded-md px-2 py-0.5';

/**
 * Back tile plus a breadcrumb trail. The last item is the current page; long
 * labels truncate with their full text kept in `title`.
 */
export function Breadcrumb({ back, items }: { back?: { href: string; label: string }; items: readonly BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
      {back ? <BackTile href={back.href} label={back.label} /> : null}
      <ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((item, index) => {
          const current = index === items.length - 1;
          return (
            <li key={`${item.label}:${index}`} className={cn('flex min-w-0 items-center gap-2', item.hideOnPhone && 'max-sm:hidden')}>
              {index > 0 ? <span aria-hidden="true" className="text-muted-foreground">/</span> : null}
              {current || !item.href ? (
                <span
                  aria-current={current ? 'page' : undefined}
                  title={item.label}
                  className={item.tag ? TAG_CHIP : 'text-foreground max-w-[18rem] truncate font-medium'}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  title={item.label}
                  className={item.tag ? TAG_CHIP : 'text-muted-foreground hover:text-foreground max-w-[12rem] truncate font-medium'}
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export interface PageTab {
  href: string;
  label: string;
  current: boolean;
  count?: number;
}

/** Link tabs under a page title, in the same pill style as the section tabs. */
export function PageTabs({ label, tabs }: { label: string; tabs: readonly PageTab[] }) {
  return (
    <nav aria-label={label} className="-m-1 flex max-w-full gap-1 overflow-x-auto p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.current ? 'page' : undefined}
          className={cn('section-tab inline-flex items-center gap-1.5', tab.current && 'section-tab-active')}
        >
          {tab.label}
          {tab.count !== undefined ? <span className="text-xs font-medium tabular-nums opacity-70">{tab.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
