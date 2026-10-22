import 'server-only';

import { cache } from 'react';

import { createClient } from '@/shared/supabase/server';
import { isMissingFunctionError } from '@/shared/supabase/schema-errors';

import { EMPTY_COMPANY_SETTINGS, parseCompanySettings, type CompanySettings } from './rules';

/**
 * The caller's company settings through `company_settings()` (migration 53).
 * PRIVATE. Cached per request: the workspace layout and the page both read it.
 * A database before 53 gets the built-in defaults, so nothing else breaks.
 */
export const readCompanySettings = cache(async (): Promise<CompanySettings & { available: boolean }> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('company_settings');
  if (error) {
    if (isMissingFunctionError(error)) return { ...EMPTY_COMPANY_SETTINGS, available: false };
    throw new Error(`Company settings could not be loaded: ${error.message}`);
  }
  return { ...parseCompanySettings(data), available: true };
});
