import * as React from 'react';

import { EmptyState } from '@/shared/ui/mission-ui';

/** The card every dashboard chart sits in: title, one-line subtitle, plot, optional footer. */
export function ChartShell({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string;
  subtitle: string;
  footer?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="soft-card flex flex-col gap-4 p-5 sm:p-6">
      <header className="flex flex-col gap-0.5">
        <h3 className="text-foreground text-base font-bold tracking-tight">{title}</h3>
        <p className="text-muted-foreground text-xs">{subtitle}</p>
      </header>
      {children}
      {footer ? <p className="text-muted-foreground text-xs">{footer}</p> : null}
    </section>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <EmptyState variant="chart">{children}</EmptyState>;
}
