// PUBLIC server-side API of the settings module.
import 'server-only';

import { readCompanySettings, readShellCompanySettings } from '@/modules/settings/internal/queries';
import { buildCategoryCatalogue, type CategoryEntry } from '@/modules/settings/internal/rules';

export * from '@/modules/settings/client';

/** The caller's company settings; built-in defaults on a database before migration 53. */
export { readCompanySettings as getCompanySettings };

/**
 * The workspace shell's read: a failure shows built-in defaults (logged) so
 * one failing read cannot take every page down. Settings pages use
 * getCompanySettings and show the failure.
 */
export { readShellCompanySettings as getShellCompanySettings };

/** The shell's catalogue, from the same non-throwing read. */
export async function shellCategoryCatalogue(): Promise<CategoryEntry[]> {
  return buildCategoryCatalogue((await readShellCompanySettings()).categoryOverrides);
}

/** The thirteen mission codes with the company's labels, active flags and order. */
export async function categoryCatalogue(): Promise<CategoryEntry[]> {
  return buildCategoryCatalogue((await readCompanySettings()).categoryOverrides);
}

/** Calendar holidays of the caller's company in [from, to], date -> name. */
export async function getCompanyHolidayNames(from: string, to: string): Promise<Record<string, string>> {
  const { holidays } = await readCompanySettings();
  return Object.fromEntries(holidays.filter((h) => h.date >= from && h.date <= to).map((h) => [h.date, h.name]));
}
