import { ArrowDownIcon, ArrowRightIcon, CornerDownRightIcon } from 'lucide-react';

import type { FlowNode, FlowTone, GuideStageContent } from '@/modules/guide';
import { cn } from '@/shared/utils';

const TONE: Record<FlowTone, string> = {
  start: 'border-border bg-muted text-foreground',
  step: 'border-primary/25 bg-primary-subtle text-primary-subtle-foreground',
  check: 'border-attention-border bg-attention-subtle text-attention-foreground',
  good: 'border-success/40 bg-success-subtle text-success-strong',
  aside: 'border-muted-foreground/45 border-dashed bg-card text-muted-foreground',
};

const COLUMNS: Record<number, string> = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' };

function Box({ node, className }: { node: FlowNode; className?: string }) {
  return (
    <div className={cn('flex min-h-20 w-full flex-col items-center justify-center rounded-2xl border px-4 py-3 text-center', TONE[node.tone], className)}>
      <span className="text-base leading-snug font-bold text-balance">{node.title}</span>
      {node.note ? <span className="mt-0.5 text-sm text-pretty">{node.note}</span> : null}
    </div>
  );
}

/**
 * A stage as a flowchart. From `sm` the main path runs left to right with
 * arrows, a side path drops below its box and alternatives stack in the last
 * column; on phones the same steps run top to bottom. Both are ordered lists
 * of the real words, so the chart reads the same without seeing it.
 */
export function GuideFlowchart({ stage }: { stage: GuideStageContent }) {
  const { path, split, branch } = stage;
  const columns = path.length + (split ? 1 : 0);

  return (
    <>
      <ol aria-label={`${stage.title}, step by step`} className={cn('hidden gap-x-12 gap-y-12 sm:grid', COLUMNS[columns])}>
        {path.map((node, index) => (
          <li key={node.title} className="relative flex" style={{ gridColumn: index + 1, gridRow: 1 }}>
            <Box node={node} />
            {index < columns - 1 ? (
              <ArrowRightIcon aria-hidden="true" className="text-muted-foreground absolute top-1/2 -right-9 size-6 -translate-y-1/2" />
            ) : null}
          </li>
        ))}
        {split ? (
          <li className="grid content-center gap-2" style={{ gridColumn: columns, gridRow: 1 }}>
            {split.map((node, index) => (
              <div key={node.title} className="grid gap-2">
                {index > 0 ? <span className="text-muted-foreground text-center text-xs font-semibold">or</span> : null}
                <Box node={node} className="min-h-16" />
              </div>
            ))}
          </li>
        ) : null}
        {branch ? (
          <li className="relative flex" style={{ gridColumn: branch.from + 1, gridRow: 2 }}>
            <span aria-hidden="true" className="absolute -top-10 left-1/2 flex -translate-x-1/2 items-center">
              <ArrowDownIcon className="text-muted-foreground size-6" />
            </span>
            <span className="text-muted-foreground absolute -top-8 left-1/2 ml-5 text-xs font-semibold whitespace-nowrap">
              {branch.label}<span className="sr-only">: </span>
            </span>
            <Box node={branch.node} />
          </li>
        ) : null}
      </ol>

      <ol aria-label={`${stage.title}, step by step`} className="grid sm:hidden">
        {path.map((node, index) => {
          const last = index === path.length - 1 && !split;
          return (
            <li key={node.title} className="grid">
              <Box node={node} />
              {branch?.from === index ? (
                <div className="mt-2 ml-4 flex items-start gap-2">
                  <CornerDownRightIcon aria-hidden="true" className="text-muted-foreground mt-6 size-5 shrink-0" />
                  <div className="grid flex-1 gap-1">
                    <span className="text-muted-foreground text-xs font-semibold">{branch.label}<span className="sr-only">: </span></span>
                    <Box node={branch.node} className="min-h-16" />
                  </div>
                </div>
              ) : null}
              {!last ? <ArrowDownIcon aria-hidden="true" className="text-muted-foreground my-2 size-6 justify-self-center" /> : null}
            </li>
          );
        })}
        {split ? (
          <li className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
            {split.map((node, index) => (
              <div key={node.title} className="contents">
                {index > 0 ? <span className="text-muted-foreground text-xs font-semibold">or</span> : null}
                <Box node={node} className="min-h-16" />
              </div>
            ))}
          </li>
        ) : null}
      </ol>
    </>
  );
}
