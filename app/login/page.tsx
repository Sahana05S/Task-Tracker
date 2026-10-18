import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { resolveLoginView, type LoginSearchParams } from '@/modules/auth';
import { LoginScreen } from '@/modules/auth/components/login-screen';

export const metadata: Metadata = {
  title: 'Sign in · TaskPulse',
};

interface LoginPageProps {
  searchParams: Promise<LoginSearchParams>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const view = await resolveLoginView(await searchParams);
  if (view.kind === 'signed-in') redirect(view.destination);

  return <LoginScreen view={view} />;
}
