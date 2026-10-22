import type { Metadata } from 'next';
import Link from 'next/link';

import { SettingsForm } from '@/modules/team/components/settings-form';
import { getPeopleAdminData } from '@/modules/team';
import { canManageCompanySettings, getCompanySettings } from '@/modules/settings';
import { CompanySettingsEditor } from '@/modules/settings/components/company-settings';
import { Building2Icon, IdCardIcon, InfoIcon, PaletteIcon, UserRoundIcon } from 'lucide-react';

import { InitialsAvatar, MissionNotice, MissionPage, MissionPageHeader, MissionPanel } from '@/shared/ui/mission-ui';
import { PageTabs } from '@/shared/ui/page-nav';
import { RoleBadge } from '@/shared/ui/tracker-badges';
import { ThemeChoice } from '@/shared/ui/theme-choice';
import { requireProfile } from '@/shared/session/profile';
import { ROLE_LABELS } from '@/shared/tracker/enums';
import { formatDate } from '@/shared/tracker/format';

export const metadata: Metadata = {
  title: 'Settings · TaskPulse',
};

type Tab = 'profile' | 'account' | 'company';

/**
 * Settings: Profile, Account and, for a managing director, Company.
 *
 * Profile and Account are deliberately narrow. The only field a member can
 * change about themselves is their display name, because that is the only
 * field the row-level security policy permits them to change. Role and
 * activation are read-only here and are changed by a managing director.
 *
 * Company holds the per-company lists the workbook kept in A_Sheet_Attributes
 * (migration 53). The tab is hidden from everyone else, and
 * `company_settings_command` refuses them in the database.
 */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [profile, query] = await Promise.all([requireProfile(), searchParams]);
  const director = canManageCompanySettings(profile.role);
  const tab: Tab = query.tab === 'account' ? 'account' : query.tab === 'company' && director ? 'company' : 'profile';

  const tabs = (
    <PageTabs
      label="Settings sections"
      tabs={[
        { href: '/settings', label: 'Profile', current: tab === 'profile' },
        { href: '/settings?tab=account', label: 'Account', current: tab === 'account' },
        ...(director ? [{ href: '/settings?tab=company', label: 'Company', current: tab === 'company' }] : []),
      ]}
    />
  );

  return (
    <MissionPage className={tab === 'company' ? undefined : 'max-w-[760px]'}>
      <MissionPageHeader
        title="Settings"
        description={tab === 'company' ? 'Lists and calendars your whole company works with' : 'Your account details and workspace role'}
        tabs={tabs}
      />
      {tab === 'profile' ? <ProfileTab profile={profile} /> : tab === 'account' ? <AccountTab profile={profile} /> : <CompanyTab />}
    </MissionPage>
  );
}

type Profile = Awaited<ReturnType<typeof requireProfile>>;

function ProfileTab({ profile }: { profile: Profile }) {
  return (
    <>
      <MissionPanel icon={UserRoundIcon} title="Profile" subtitle="Your display name is the only field you can change here.">
        <div className="mb-5 flex items-center gap-3">
          <InitialsAvatar name={profile.fullName} className="size-11 text-sm" />
          <div className="min-w-0">
            <p className="text-foreground truncate text-sm font-semibold">{profile.fullName}</p>
            <p className="text-muted-foreground truncate text-xs">{profile.email}</p>
          </div>
        </div>
        <SettingsForm profile={profile} />
      </MissionPanel>
      <MissionPanel icon={PaletteIcon} title="Appearance" subtitle="Remembered on this device. System follows your computer or phone setting.">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-foreground text-sm font-medium">Theme</span>
          <ThemeChoice />
        </div>
      </MissionPanel>
    </>
  );
}

function AccountTab({ profile }: { profile: Profile }) {
  return (
    <MissionPanel icon={IdCardIcon} title="Account" subtitle="Managed by a managing director. Ask one to change your role or employee code.">
      <dl className="divide-border divide-y text-sm">
        <Row label="Email">
          <span className="text-foreground font-mono text-xs">{profile.email}</span>
        </Row>
        <Row label="Employee code">
          <span className="text-foreground font-mono text-xs">{profile.employeeId}</span>
        </Row>
        <Row label="Role">
          <span className="flex items-center gap-2">
            <RoleBadge role={profile.role} />
            <span className="text-muted-foreground text-xs">{ROLE_LABELS[profile.role]}</span>
          </span>
        </Row>
        <Row label="Status">
          <span className={profile.isActive ? 'badge-soft badge-status-done' : 'badge-soft badge-status-discarded'}>
            {profile.isActive ? 'Active' : 'Deactivated'}
          </span>
        </Row>
        <Row label="Member since">
          <span className="text-foreground font-mono text-xs">{formatDate(profile.createdAt.slice(0, 10))}</span>
        </Row>
      </dl>
    </MissionPanel>
  );
}

async function CompanyTab() {
  const [settings, people] = await Promise.all([getCompanySettings(), getPeopleAdminData()]);
  if (!settings.available) {
    return (
      <MissionNotice tone="attention" icon={InfoIcon}>
        Company settings need the latest database update (migration 53). Until then the built-in mission types apply and meeting types stay free text.
      </MissionNotice>
    );
  }
  return (
    <>
      <MissionNotice icon={Building2Icon}>
        These lists belong to your company and apply to everyone in it. Employee codes are edited on{' '}
        <Link href="/team/manage" className="link">
          Manage people
        </Link>
        .
      </MissionNotice>
      <CompanySettingsEditor
        settings={settings}
        members={people.members.map((member) => ({ id: member.id, fullName: member.fullName, isActive: member.isActive }))}
      />
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="min-w-0 text-right break-all">{children}</dd>
    </div>
  );
}
