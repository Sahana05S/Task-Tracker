import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { resolveResetPasswordView, type ResetPasswordSearchParams } from '@/modules/auth';
import { ResetPasswordScreen } from '@/modules/auth/components/reset-password-screen';

export const metadata: Metadata = {
  title: 'Reset password · TaskPulse',
};

interface ResetPasswordPageProps {
  searchParams: Promise<ResetPasswordSearchParams>;
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const view = await resolveResetPasswordView(await searchParams);
  if (view.kind === 'verify') redirect(view.callbackPath);

  return <ResetPasswordScreen view={view} />;
}
