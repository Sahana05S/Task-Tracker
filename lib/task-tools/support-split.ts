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

export function calculateSupportSplit({
  sourceScale,
  mode,
  amount,
  percentage,
}: SupportSplitInput): SupportSplitResult {
  if (!Number.isFinite(sourceScale) || sourceScale < 0) {
    throw new Error('Source task scale must be zero or greater.');
  }

  switch (mode) {
    case 'split-even': {
      const supportScale = sourceScale / 2;
      return { supportScale, sourceScaleAfterSplit: sourceScale - supportScale };
    }
    case 'split-uneven': {
      const supportScale = requireAmount(amount, sourceScale);
      return { supportScale, sourceScaleAfterSplit: sourceScale - supportScale };
    }
    case 'proportional': {
      const supportScale = sourceScale * (requirePercentage(percentage) / 100);
      return { supportScale, sourceScaleAfterSplit: null };
    }
    case 'absolute': {
      const supportScale = requireAmount(amount, 500);
      return { supportScale, sourceScaleAfterSplit: null };
    }
  }
}

function requireAmount(value: number | null | undefined, max: number): number {
  if (!Number.isFinite(value) || value === null || value === undefined) {
    throw new Error('Enter a valid support scale.');
  }
  if (value < 0 || value > max) {
    throw new Error(`Support scale must be between 0 and ${max}.`);
  }
  return value;
}

function requirePercentage(value: number | null | undefined): number {
  if (!Number.isFinite(value) || value === null || value === undefined) {
    throw new Error('Enter a valid support percentage.');
  }
  if (value < 0 || value > 100) {
    throw new Error('Support percentage must be between 0 and 100.');
  }
  return value;
}
