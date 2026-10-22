// PUBLIC client-safe exports of the settings module: types and pure rules only
// (no server imports), so 'use client' components may use them.
export {
  agendaLines,
  buildCategoryCatalogue,
  categoryChoices,
  categoryLabelMap,
  formatSheetTag,
  meetingTypeChoices,
  renderTitlePattern,
  STANDING_SCALE_MODES,
  type CategoryEntry,
  type CategoryOverrides,
  type CompanySettings,
  type MeetingType,
  type SettingsSection,
  type StandingMission,
  type StandingScaleMode,
} from '@/modules/settings/internal/rules';
export { canManageCompanySettings } from '@/modules/settings/internal/permissions';
