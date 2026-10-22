import * as React from 'react';
import type { LucideIcon } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card';

export interface SectionPlaceholderProps {
  title: string;
  description: string;
  icon: LucideIcon;
  /** Which roadmap phase delivers this section's real content. */
  phase: string;
  children?: React.ReactNode;
}

/**
 * Stands in for a workspace section whose module is scheduled for a later
 * roadmap phase. Keeps every navigation target resolvable so the shell and the
 * route guards can be exercised end to end.
 */
export function SectionPlaceholder({
  title,
  description,
  icon: Icon,
  phase,
  children,
}: SectionPlaceholderProps) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <span className="bg-primary-subtle text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This module is built in{' '}
            <span className="font-medium text-foreground">{phase}</span>.
          </p>
        </CardContent>
      </Card>

      {children}
    </div>
  );
}
