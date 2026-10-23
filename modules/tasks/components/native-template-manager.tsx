'use client';

import * as React from 'react';
import { ListTodoIcon, PencilIcon, PlusIcon } from 'lucide-react';

import { TEMPLATE_SECTIONS, sectionCounts } from '@/modules/tasks/components/templates/nodes';
import { TemplateEditor } from '@/modules/tasks/components/templates/template-editor';
import type { NativeTemplate } from '@/modules/tasks/internal/details-contract';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/mission-ui';

/**
 * Mission templates on the Tools page: the latest version of each template,
 * with New and Edit opening the editor in a side panel.
 */
export function NativeTemplateManager({ templates }: { templates: readonly NativeTemplate[] }) {
  // null: closed; 'new': a new template; otherwise the version being built on.
  const [editing, setEditing] = React.useState<NativeTemplate | 'new' | null>(null);
  const latest = templates.filter(
    (template) => !templates.some((other) => other.templateId === template.templateId && other.version > template.version),
  );

  const newButton = (
    <Button type="button" variant="outline" size="sm" onClick={() => setEditing('new')}>
      <PlusIcon aria-hidden="true" />
      New template
    </Button>
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground max-w-prose text-sm">
          Reusable starting checklists and guidance for new missions.
        </p>
        {latest.length > 0 ? newButton : null}
      </div>

      {latest.length === 0 ? (
        <EmptyState icon={ListTodoIcon} title="No templates yet" action={newButton}>
          Create one to give new missions a ready-made checklist.
        </EmptyState>
      ) : (
        <ul className="divide-border grid divide-y">
          {latest.map((template) => {
            const counts = sectionCounts(template.checklistNodes);
            return (
              <li key={template.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3 first:pt-0 last:pb-0">
                <div className="grid min-w-0 flex-1 gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-foreground truncate text-sm font-semibold">{template.name}</span>
                    <span className="badge-soft badge-neutral">Version {template.version}</span>
                    {template.requiresReview ? <span className="badge-soft badge-category">Needs review</span> : null}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {TEMPLATE_SECTIONS.map((section) => `${counts[section.key]} ${section.label}`).join(' · ')}
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setEditing(template)}>
                  <PencilIcon aria-hidden="true" />
                  Edit<span className="sr-only"> {template.name}</span>
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <TemplateEditor
        open={editing !== null}
        template={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
