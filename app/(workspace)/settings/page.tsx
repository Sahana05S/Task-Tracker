import type { Metadata } from 'next';

import { SettingsForm } from '@/modules/team/components/settings-form';
import { IdCardIcon, UserRoundIcon } from 'lucide-react';

import { InitialsAvatar, MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';
import { RoleBadge } from '@/shared/ui/tracker-badges';
import { requireProfile } from '@/shared/session/profile';
import { ROLE_LABELS } from '@/shared/tracker/enums';
import { formatDate } from '@/shared/tracker/format';

export const metadata: Metadata = {
  title: 'Settings · TaskPulse',
};

/**
 * Account settings.
 *
 * Deliberately narrow. The only field a member can change about themselves is
 * their display name, because that is the only field the row-level security policy
 * permits them to change. Showing an editor for anything else would be an
 * interface promising something the database refuses.
 *
 * Role and activation are read-only here and are changed by a managing director.
 */
export default async function SettingsPage() {
  const profile = await requireProfile();

  return (
    <MissionPage className="max-w-[760px]">
      <MissionPageHeader
        title="Settings"
        description="Your account details and workspace role"
      />

      <section
        aria-labelledby="profile-heading"
        className="soft-card p-5 sm:p-6"
      >
        <div className="flex items-center gap-3">
          <InitialsAvatar name={profile.fullName} className="size-11 text-sm" />
          <div className="min-w-0">
            <h2
              id="profile-heading"
              className="text-foreground flex items-center gap-2 text-base font-bold tracking-tight"
            >
              <UserRoundIcon className="text-primary size-5 shrink-0" aria-hidden="true" />
              Profile
            </h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Your display name is the only field you can change here.
            </p>
          </div>
        </div>

        <div className="mt-5">
          <SettingsForm profile={profile} />
        </div>
      </section>

      <section
        aria-labelledby="account-heading"
        className="soft-card p-5 sm:p-6"
      >
        <h2
          id="account-heading"
          className="text-foreground flex items-center gap-2 text-base font-bold tracking-tight"
        >
          <IdCardIcon className="text-primary size-5 shrink-0" aria-hidden="true" />
          Account
        </h2>
        <p className="text-muted-foreground mt-0.5 text-xs">
          Managed by a managing director. Contact one to change your role.
        </p>

        <dl className="divide-border mt-4 divide-y text-sm">
          <Row label="Email">
            <span className="text-foreground font-mono text-xs">
              {profile.email}
            </span>
          </Row>
          <Row label="Employee ID">
            <span className="text-foreground font-mono text-xs">
              {profile.employeeId}
            </span>
          </Row>
          <Row label="Role">
            <span className="flex items-center gap-2">
              <RoleBadge role={profile.role} />
              <span className="text-muted-foreground text-xs">
                {ROLE_LABELS[profile.role]}
              </span>
            </span>
          </Row>
          <Row label="Status">
            <span
              className={
                profile.isActive
                  ? 'badge-soft badge-status-done'
                  : 'badge-soft badge-status-discarded'
              }
            >
              {profile.isActive ? 'Active' : 'Deactivated'}
            </span>
          </Row>
          <Row label="Member since">
            <span className="text-foreground font-mono text-xs">
              {formatDate(profile.createdAt.slice(0, 10))}
            </span>
          </Row>
        </dl>
      </section>
    </MissionPage>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="min-w-0 text-right break-all">{children}</dd>
    </div>
  );
}
