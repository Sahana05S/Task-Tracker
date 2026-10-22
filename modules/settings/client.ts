// PUBLIC client-safe exports of the settings module: types and pure rules only
// (no server imports), so 'use client' components may use them.
export {
  agendaLines,
  buildCategoryCatalogue,
  categoryChoices,
  categoryLabelMap,
  EMPTY_COMPANY_SETTINGS,
  formatSheetTag,
  meetingTypeChoices,
  renderTitlePattern,
  STANDING_SCALE_MODES,
  type CategoryEntry,
  type CategoryOverride,
  type CategoryOverrides,
  type CompanyHoliday,
  type CompanySettings,
  type MeetingType,
  type OwnerMode,
  type SettingsSection,
  type StandingMission,
  type StandingScaleMode,
} from '@/modules/settings/internal/rules';
export { canManageCompanySettings } from '@/modules/settings/internal/permissions';
