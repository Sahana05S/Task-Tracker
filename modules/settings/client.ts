// PUBLIC client-safe exports of the settings module: types and pure rules only
// (no server imports), so 'use client' components may use them.
export {
  agendaLines,
  BRANDING_URL_FIELDS,
  buildCategoryCatalogue,
  categoryChoices,
  categoryLabelMap,
  formatSheetTag,
  isBrandUrl,
  meetingTypeChoices,
  renderTitlePattern,
  SCALE_MODE_LABELS,
  STANDING_SCALE_MODES,
  type BrandingUrlField,
  type CategoryEntry,
  type CategoryOverrides,
  type CompanyBranding,
  type CompanySettings,
  type MeetingType,
  type SettingsSection,
  type StandingMission,
  type StandingScaleMode,
} from '@/modules/settings/internal/rules';
export { canManageCompanySettings } from '@/modules/settings/internal/permissions';
