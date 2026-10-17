import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges conditional class names and resolves Tailwind conflicts so that the
 * last competing utility wins. Used by every component in `components/ui`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Derives up to two uppercase initials from a display name, for avatar
 * fallbacks. Returns `'?'` when the name yields nothing usable.
 */
export function getInitials(fullName: string): string {
  const initials = fullName
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return initials || '?';
}
