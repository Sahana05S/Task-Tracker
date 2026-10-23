import { cn } from '@/shared/utils';

/** The star glyph alone (24×24, `currentColor`); `app/icon.svg` and `app/apple-icon.tsx` draw the same paths. */
export const STELLAR_STAR_PATHS = [
  'M11 4.5Q12.1 11.9 19.5 13Q12.1 14.1 11 21.5Q9.9 14.1 2.5 13Q9.9 11.9 11 4.5Z',
  'M18.5 2.9Q18.9 5.1 21.1 5.5Q18.9 5.9 18.5 8.1Q18.1 5.9 15.9 5.5Q18.1 5.1 18.5 2.9Z',
] as const;

/**
 * Stellar's product mark: a four-point star with a small sparkle on a primary
 * tile. Decorative; the wordmark or link label next to it names the product.
 */
export function StellarMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg', className)}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="size-[62%]">
        {STELLAR_STAR_PATHS.map((d) => <path key={d} d={d} />)}
      </svg>
    </span>
  );
}
