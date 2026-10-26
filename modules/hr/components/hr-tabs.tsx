import { PageTabs } from '@/shared/ui/page-nav';

/** HR's two pages: the branded documents and the performance reviews. */
export function HrTabs({ current, pending }: { current: 'documents' | 'reviews'; pending?: number }) {
  return (
    <PageTabs
      label="HR sections"
      tabs={[
        { href: '/hr/documents', label: 'Documents', current: current === 'documents' },
        { href: '/hr/reviews', label: 'Performance reviews', current: current === 'reviews', count: pending || undefined },
      ]}
    />
  );
}
