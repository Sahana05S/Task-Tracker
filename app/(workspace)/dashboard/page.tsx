import type { Metadata } from 'next';

import { RoleBadge } from '@/components/tracker/tracker-badges';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { requireProfile } from '@/lib/auth/profile';

export const metadata: Metadata = {
  title: 'Dashboard · TaskPulse',
};

export default async function DashboardPage() {
  const profile = await requireProfile();

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Welcome back, {profile.fullName}</CardTitle>
          <CardDescription>
            Your workspace is connected. Team metrics appear here once the
            medians engine lands.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Employee ID" value={profile.employeeId} />
            <Detail label="Email" value={profile.email} />
            <div className="flex flex-col gap-1">
              <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                Role
              </dt>
              <dd>
                <RoleBadge role={profile.role} />
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Star Performer, Team Medians, Scaled Progress</CardTitle>
          <CardDescription>
            Productivity differentials, priority loading and criticality scores
            are computed in Phase 5.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">
        {label}
      </dt>
      <dd className="truncate text-sm text-slate-900">{value}</dd>
    </div>
  );
}
