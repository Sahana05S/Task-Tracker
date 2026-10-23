'use client';

import { useCompanyBranding } from '@/modules/settings/components/company-settings-context';
import type { CompanyBranding } from '@/modules/settings/client';
import { StellarMark } from '@/shared/ui/stellar-mark';
import { cn } from '@/shared/utils';

/**
 * One brand image with its dark-theme variant: the light file in the light
 * theme, the dark file (or the light one when none is set) in the dark theme.
 * Plain <img>: the addresses are the company's own files or https links, so no
 * image optimizer allow-list is involved.
 */
export function ThemedBrandImage({ light, dark, alt = '', className }: { light: string; dark: string | null; alt?: string; className?: string }) {
  return dark && dark !== light ? (
    <>
      <img src={light} alt={alt} className={cn('dark:hidden', className)} />
      <img src={dark} alt={alt} className={cn('hidden dark:block', className)} />
    </>
  ) : (
    <img src={light} alt={alt} className={className} />
  );
}

/** The company's mark and name for the workspace top bar; Stellar's when the company has none. */
export function CompanyBrand({ branding: given, nameClassName }: { branding?: CompanyBranding | null; nameClassName?: string }) {
  const fromContext = useCompanyBranding();
  const branding = given === undefined ? fromContext : given;
  const name = branding?.companyName || 'Stellar';
  return (
    <>
      {branding?.markUrl ? (
        <ThemedBrandImage light={branding.markUrl} dark={branding.markDarkUrl} className="size-8 shrink-0 object-contain" />
      ) : (
        <StellarMark />
      )}
      <span className={cn('text-foreground truncate text-base font-bold tracking-tight', nameClassName)}>{name}</span>
    </>
  );
}

/** The accessible name for the top bar's home link. */
export function useBrandHomeLabel(): string {
  return `${useCompanyBranding()?.companyName || 'Stellar'} home`;
}
