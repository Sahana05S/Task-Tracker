'use client';

import { ChevronDownIcon, XIcon } from 'lucide-react';

import { canCopy, operationsFor } from '@/modules/tasks/components/tools/operations';
import type { ToolOperation } from '@/modules/tasks/internal/tools/contract';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { cn } from '@/shared/utils';

export interface BulkActionBarProps {
  selectedCount: number;
  canManage: boolean;
  onRun: (command: ToolOperation) => void;
  onClear: () => void;
}

const barButton =
  'text-white/85 hover:bg-white/10 hover:text-white focus-visible:ring-offset-foreground h-9 rounded-lg px-3 text-[13px]';

/**
 * Sticky bar under the Missions table while rows are selected. Batch actions
 * act on every selected row; "Copy" reads one source, so it is enabled at
 * exactly one row and says why otherwise. Members see Done and Refresh only.
 */
export function BulkActionBar({ selectedCount, canManage, onRun, onClear }: BulkActionBarProps) {
  if (selectedCount === 0) return null;
  const batches = operationsFor(canManage, 'batch');
  const copies = operationsFor(canManage, 'copy');
  const copyEnabled = canCopy(selectedCount);

  return (
    <div className="pointer-events-none sticky bottom-4 z-20 flex justify-center">
      <div
        role="toolbar"
        aria-label={`Actions for ${selectedCount} selected ${selectedCount === 1 ? 'mission' : 'missions'}`}
        className="bg-foreground shadow-soft-lg pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl p-1.5 text-white motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2"
      >
        <span className="bg-primary flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold tabular-nums">
          {selectedCount} selected
        </span>

        <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-white/15" />

        {batches.map((operation) => (
          <Button
            key={operation.command}
            type="button"
            variant="ghost"
            className={barButton}
            onClick={() => onRun(operation.command)}
          >
            {operation.label}
          </Button>
        ))}

        {copies.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className={cn(barButton, 'gap-1')}
                disabled={!copyEnabled}
                title={copyEnabled ? undefined : 'Copy needs exactly one selected mission'}
              >
                Copy…
                <ChevronDownIcon className="size-3.5" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top">
              <DropdownMenuLabel>Copy this mission</DropdownMenuLabel>
              {copies.map((operation) => (
                <DropdownMenuItem key={operation.command} onSelect={() => onRun(operation.command)}>
                  {operation.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-white/15" />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(barButton, 'w-9 px-0')}
          onClick={onClear}
          aria-label="Clear selection"
        >
          <XIcon aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
