import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { canViewPersonalRecords, getPersonalRecords } from '@/modules/personnel';
import { PersonalRecords } from '@/modules/personnel/components/personal-records';
import { getEmployeeByEmployeeId, normalizeEmployeeIdParam } from '@/modules/team';
import { requireProfile } from '@/shared/session/profile';
import { MissionNotice, MissionPage } from '@/shared/ui/mission-ui';

import { ProfileHeader, readPlacement } from '../profile-header';

interface PersonalInfoPageProps {
  params: Promise<{ employeeId: string }>;
}

export async function generateMetadata({ params }: PersonalInfoPageProps): Promise<Metadata> {
  const { employeeId } = await params;
  return { title: `${normalizeEmployeeIdParam(employeeId) ?? 'Employee'} · Personal info` };
}

/** Personal records (M19): the person's own, or anyone's for the managing director. */
export default async function PersonalInfoPage({ params }: PersonalInfoPageProps) {
  const viewer = await requireProfile();
  const normalized = normalizeEmployeeIdParam((await params).employeeId);
  if (!normalized) notFound();
  const employee = await getEmployeeByEmployeeId(normalized);
  if (!employee || !canViewPersonalRecords(viewer, employee.id)) notFound();
  const [records, placement] = await Promise.all([getPersonalRecords(employee.id), readPlacement(employee.id)]);
  if (!records.ok && records.reason !== 'unavailable') notFound();
  const own = viewer.id === employee.id;

  return (
    <MissionPage>
      <ProfileHeader
        employee={employee}
        current="personal"
        description={own ? 'Your records: marksheets and Aadhaar card' : `${employee.employeeId} · marksheets and Aadhaar card`}
        query=""
        placement={placement}
        showPersonal
      />
      {records.ok ? (
        <PersonalRecords documents={records.data.documents} links={records.data.links} editable={own} ownerName={employee.fullName} />
      ) : (
        <MissionNotice>{records.error}</MissionNotice>
      )}
    </MissionPage>
  );
}
