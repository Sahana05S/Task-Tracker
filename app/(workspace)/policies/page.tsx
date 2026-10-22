import type { Metadata } from 'next';

import { getPoliciesWorkspace } from '@/modules/policies';
import { PoliciesWorkspace } from '@/modules/policies/components/policies-workspace';
import { requireProfile } from '@/shared/session/profile';

export const metadata: Metadata = { title: 'Policies · TaskPulse' };

/**
 * Company policies: the managing director sets them from templates; members see
 * the rules that apply to them, where they stand and the commendations earned.
 */
export default async function PoliciesPage() {
  const profile = await requireProfile();
  const model = await getPoliciesWorkspace(profile);
  return <PoliciesWorkspace model={model} now={Date.now()} />;
}
