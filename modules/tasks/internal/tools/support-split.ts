import { supportAmounts } from '@/modules/tasks/internal/tools/contract';
export type SupportSplitMode =
  | 'split-even'
  | 'split-uneven'
  | 'proportional'
  | 'absolute';

export interface SupportSplitInput {
  readonly sourceScale: number;
  readonly mode: SupportSplitMode;
  readonly amount?: number | null;
  readonly percentage?: number | null;
}

export interface SupportSplitResult {
  readonly supportScale: number;
  readonly sourceScaleAfterSplit: number | null;
}

/** Compatibility read helper; no permission or approval for a tool operation. */
export function calculateSupportSplit({sourceScale,mode,amount,percentage}:SupportSplitInput):SupportSplitResult {
  if(!Number.isFinite(sourceScale)||sourceScale<0)throw new Error('Source task scale must be zero or greater.');
  const split=supportAmounts(String(sourceScale),mode,amount==null?undefined:String(amount),percentage==null?undefined:String(percentage),'whole');
  return {supportScale:split.support.number(),sourceScaleAfterSplit:split.sourceAfter?.number()??null};
}
