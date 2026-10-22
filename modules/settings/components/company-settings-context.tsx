'use client';

import * as React from 'react';

import { buildCategoryCatalogue, categoryLabelMap, type CategoryEntry, type MeetingType } from '@/modules/settings/client';
import type { TaskCategory } from '@/types/tracker';

/**
 * The company's mission-type catalogue and meeting types for client
 * components, provided once by the workspace layout. Without a provider the
 * built-in labels apply and no meeting types are configured.
 */
interface CompanyCatalogues {
  catalogue: readonly CategoryEntry[];
  meetingTypes: readonly MeetingType[];
}

const DEFAULTS: CompanyCatalogues = { catalogue: buildCategoryCatalogue(), meetingTypes: [] };
const CompanyCataloguesContext = React.createContext<CompanyCatalogues>(DEFAULTS);

export function CompanySettingsProvider({ catalogue, meetingTypes, children }: CompanyCatalogues & { children: React.ReactNode }) {
  const value = React.useMemo(() => ({ catalogue, meetingTypes }), [catalogue, meetingTypes]);
  return <CompanyCataloguesContext.Provider value={value}>{children}</CompanyCataloguesContext.Provider>;
}

/** Mission types in company order, with labels and active flags. */
export function useCategoryCatalogue(): readonly CategoryEntry[] {
  return React.useContext(CompanyCataloguesContext).catalogue;
}

/** Code -> the company's label for that mission type. */
export function useCategoryLabels(): Record<TaskCategory, string> {
  const catalogue = useCategoryCatalogue();
  return React.useMemo(() => categoryLabelMap(catalogue), [catalogue]);
}

/** The company's meeting types (active and hidden), in order. */
export function useMeetingTypes(): readonly MeetingType[] {
  return React.useContext(CompanyCataloguesContext).meetingTypes;
}
