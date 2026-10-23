'use client';

import * as React from 'react';
import { PlusIcon, Trash2Icon } from 'lucide-react';

import {
  TEMPLATE_NODE_TYPES,
  TEMPLATE_SECTIONS,
  addNode,
  changeSection,
  descendantKeys,
  parentOptions,
  removeNode,
  sectionRows,
  toEditorNodes,
  toPayloadNodes,
  updateNode,
  type EditorNode,
  type TemplateNodeType,
  type TemplateSection,
} from '@/modules/tasks/components/templates/nodes';
import { publishNativeTemplate } from '@/modules/tasks/detail-actions';
import { DETAIL_FIELDS, type NativeTemplate } from '@/modules/tasks/internal/details-contract';
import { Button } from '@/shared/ui/button';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { Field } from '@/shared/ui/form-field';
import { MissionNotice } from '@/shared/ui/mission-ui';
import { NativeSelect } from '@/shared/ui/native-select';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';

/** Mission guidance fields, grouped as the mission page shows them. */
const GUIDANCE_GROUPS: readonly { title: string | null; fields: readonly (typeof DETAIL_FIELDS)[number][] }[] = [
  { title: null, fields: DETAIL_FIELDS.filter((field) => field.group === 'description') },
  { title: 'SMART goal', fields: DETAIL_FIELDS.filter((field) => field.group === 'smart') },
  { title: 'Inputs, process and outputs', fields: DETAIL_FIELDS.filter((field) => ['input', 'process', 'output'].includes(field.group)) },
  { title: null, fields: DETAIL_FIELDS.filter((field) => field.group === 'review') },
];

/**
 * The template editor in a side panel. `template` is the latest version to
 * build on, or null for a new template. Publishing always saves a new version
 * through `publishNativeTemplate`; missions made from earlier versions keep
 * their own copies.
 */
export function TemplateEditor({
  open,
  template,
  onClose,
}: {
  open: boolean;
  template: NativeTemplate | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-2xl">
        {open ? <EditorBody key={template?.id ?? 'new'} template={template} onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function EditorBody({ template, onClose }: { template: NativeTemplate | null; onClose: () => void }) {
  const [nodes, setNodes] = React.useState<EditorNode[]>(() => toEditorNodes(template?.checklistNodes));
  const [filled, setFilled] = React.useState<ReadonlySet<string>>(
    () => new Set(DETAIL_FIELDS.filter((field) => template?.instructions[field.key]?.trim()).map((field) => field.key)),
  );
  const nextVersion = (template?.version ?? 0) + 1;
  const id = (name: string) => `template-${template?.id ?? 'new'}-${name}`;

  const noteFilled = (key: string, value: string) => {
    setFilled((current) => {
      const next = new Set(current);
      if (value.trim()) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  return (
    <>
      <SheetHeader className="border-border border-b pb-4">
        <p className="eyebrow">Mission template</p>
        <SheetTitle className="pr-8 text-lg">{template ? `Edit ${template.name}` : 'New template'}</SheetTitle>
        <SheetDescription>
          {template
            ? `Publishing saves version ${nextVersion}. Missions already using an earlier version keep theirs.`
            : 'A reusable starting checklist and guidance for new missions.'}
        </SheetDescription>
      </SheetHeader>

      <ExecutionForm action={publishNativeTemplate} scope={'publishTemplate:' + (template?.id ?? '')} onSuccess={onClose}>
        <input type="hidden" name="templateId" value={template?.templateId ?? ''} />
        <input type="hidden" name="templateVersion" value={template?.version ?? 0} />
        <input type="hidden" name="checklistNodes" value={JSON.stringify(toPayloadNodes(nodes))} />

        <div className="grid gap-6 px-5 py-5">
          {template?.requiresReview ? (
            <MissionNotice tone="attention">
              <p>Legacy template retained for review. Publish a new version with explicit sections; the original stays unchanged.</p>
              <details className="mt-2">
                <summary className="cursor-pointer font-medium">Show the legacy content</summary>
                <p className="mt-2 whitespace-pre-wrap">{template.legacyDescription}</p>
                {template.legacyNodes?.map((node, i) => (
                  <p key={i}>{node.node_type}: {node.title} {node.description}</p>
                ))}
              </details>
            </MissionNotice>
          ) : null}

          <Field id={id('name')} label="Name" required hint={template ? 'A template keeps its name across versions.' : undefined}>
            <input
              id={id('name')}
              name="templateName"
              className="field w-full"
              defaultValue={template?.name ?? ''}
              readOnly={Boolean(template)}
              required
            />
          </Field>

          <details className="border-border group rounded-xl border">
            <summary className="flex cursor-pointer items-baseline justify-between gap-3 px-4 py-3">
              <span className="text-foreground text-sm font-semibold">Mission guidance</span>
              <span className="text-muted-foreground text-xs">{filled.size} of {DETAIL_FIELDS.length} filled</span>
            </summary>
            <div className="border-border grid gap-4 border-t px-4 py-4">
              <p className="text-muted-foreground text-xs">
                Shown to whoever fills in the mission as guidance. It isn&apos;t pre-filled as their work.
              </p>
              {GUIDANCE_GROUPS.map((group, index) => (
                <fieldset key={index} className="grid gap-3">
                  {group.title ? <legend className="text-foreground mb-1 text-sm font-semibold">{group.title}</legend> : null}
                  {group.fields.map((field) => (
                    <Field key={field.key} id={id(field.key)} label={field.label}>
                      <textarea
                        id={id(field.key)}
                        name={'instruction_' + field.key}
                        rows={2}
                        className="field w-full"
                        defaultValue={template?.instructions[field.key] ?? ''}
                        onChange={(event) => noteFilled(field.key, event.target.value)}
                      />
                    </Field>
                  ))}
                </fieldset>
              ))}
            </div>
          </details>

          <section className="grid gap-4" aria-labelledby={id('checklist')}>
            <div className="grid gap-1">
              <h3 id={id('checklist')} className="text-foreground text-sm font-semibold">Checklist</h3>
              <p className="text-muted-foreground text-xs">
                {TEMPLATE_NODE_TYPES.map((type, i) => (
                  <React.Fragment key={type.key}>
                    {i > 0 ? ' · ' : ''}
                    <span className="text-foreground font-medium">{type.key}</span>: {type.hint}
                  </React.Fragment>
                ))}
              </p>
            </div>
            {TEMPLATE_SECTIONS.map((section) => (
              <ChecklistSection key={section.key} section={section} nodes={nodes} onChange={setNodes} idPrefix={id(section.key)} />
            ))}
          </section>
        </div>

        <div className="border-border flex flex-wrap justify-end gap-2 border-t px-5 py-4">
          <SheetClose asChild>
            <Button type="button" variant="outline">Cancel</Button>
          </SheetClose>
          <Button type="submit">{template ? `Publish version ${nextVersion}` : 'Publish template'}</Button>
        </div>
      </ExecutionForm>
    </>
  );
}

function ChecklistSection({
  section,
  nodes,
  onChange,
  idPrefix,
}: {
  section: { key: TemplateSection; label: string };
  nodes: readonly EditorNode[];
  onChange: (nodes: EditorNode[]) => void;
  idPrefix: string;
}) {
  const rows = sectionRows(nodes, section.key);
  return (
    <div className="border-border grid gap-3 rounded-xl border p-4">
      <h4 className="text-foreground text-sm font-semibold">
        {section.label}
        <span className="text-muted-foreground ml-1.5 font-normal">{rows.length}</span>
      </h4>
      {rows.length === 0 ? <p className="text-muted-foreground text-xs">No items yet.</p> : null}
      <ol className="grid gap-2">
        {rows.map(({ node, depth }) => (
          <ChecklistRow
            key={node.key}
            node={node}
            depth={depth}
            nodes={nodes}
            sectionLabel={section.label}
            onChange={onChange}
            idPrefix={`${idPrefix}-${node.key}`}
          />
        ))}
      </ol>
      <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => onChange(addNode(nodes, section.key))}>
        <PlusIcon aria-hidden="true" />
        Add item to {section.label}
      </Button>
    </div>
  );
}

function ChecklistRow({
  node,
  depth,
  nodes,
  sectionLabel,
  onChange,
  idPrefix,
}: {
  node: EditorNode;
  depth: number;
  nodes: readonly EditorNode[];
  sectionLabel: string;
  onChange: (nodes: EditorNode[]) => void;
  idPrefix: string;
}) {
  const nested = descendantKeys(nodes, node.key).size;
  const name = node.title.trim() || 'untitled item';
  return (
    <li
      className="bg-muted/40 grid gap-2 rounded-lg p-3"
      // Indent nested rows, capped so deep trees still fit a phone.
      style={{ marginInlineStart: `${Math.min(depth, 4) * 1.25}rem` }}
    >
      <div className="flex items-end gap-2">
        <Field id={`${idPrefix}-title`} label={depth > 0 ? 'Nested item' : 'Item'} className="min-w-0 flex-1">
          <input
            id={`${idPrefix}-title`}
            className="field w-full"
            required
            value={node.title}
            placeholder="What needs doing?"
            onChange={(event) => onChange(updateNode(nodes, node.key, { title: event.target.value }))}
          />
        </Field>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={nested > 0 ? `Remove ${name} and the ${nested} nested under it` : `Remove ${name}`}
          title={nested > 0 ? `Also removes ${nested} nested` : 'Remove'}
          onClick={() => onChange(removeNode(nodes, node.key))}
        >
          <Trash2Icon aria-hidden="true" />
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Field id={`${idPrefix}-type`} label="Type">
          <NativeSelect
            id={`${idPrefix}-type`}
            value={node.node_type}
            onChange={(event) => onChange(updateNode(nodes, node.key, { node_type: event.target.value as TemplateNodeType }))}
          >
            {TEMPLATE_NODE_TYPES.map((type) => <option key={type.key} value={type.key}>{type.key}</option>)}
          </NativeSelect>
        </Field>
        <Field id={`${idPrefix}-parent`} label="Sits inside">
          <NativeSelect
            id={`${idPrefix}-parent`}
            value={node.parent_key}
            onChange={(event) => onChange(updateNode(nodes, node.key, { parent_key: event.target.value }))}
          >
            <option value="">Top of {sectionLabel}</option>
            {parentOptions(nodes, node.key).map((option) => (
              <option key={option.key} value={option.key}>{option.title.trim() || 'Untitled item'}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field id={`${idPrefix}-section`} label="Section">
          <NativeSelect
            id={`${idPrefix}-section`}
            value={node.section}
            onChange={(event) => onChange(changeSection(nodes, node.key, event.target.value as TemplateSection))}
          >
            {TEMPLATE_SECTIONS.map((section) => <option key={section.key} value={section.key}>{section.label}</option>)}
          </NativeSelect>
        </Field>
      </div>
    </li>
  );
}
