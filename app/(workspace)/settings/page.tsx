import type { Metadata } from 'next';

import { SettingsForm } from '@/components/layout/settings-form';
import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { RoleBadge } from '@/components/tracker/tracker-badges';
import { requireProfile } from '@/lib/auth/profile';
import { ROLE_LABELS } from '@/lib/tracker/enums';
import { formatDate } from '@/lib/tracker/format';

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
    <>
      <WorkspaceHeader
        title="Settings"
        description="Your account details and workspace role"
      />

      <div className="flex flex-col gap-4 px-4 py-4 lg:px-6">
        <section
          aria-labelledby="profile-heading"
          className="soft-card max-w-2xl p-4"
        >
          <h2
            id="profile-heading"
            className="text-foreground text-sm font-semibold"
          >
            Profile
          </h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Your display name is the only field you can change here.
          </p>

          <div className="mt-4">
            <SettingsForm profile={profile} />
          </div>
        </section>

        <section
          aria-labelledby="account-heading"
          className="soft-card max-w-2xl p-4"
        >
          <h2
            id="account-heading"
            className="text-foreground text-sm font-semibold"
          >
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
      </div>
    </>
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
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
