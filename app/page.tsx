import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { CapabilitiesGrid } from '@/components/marketing/capabilities-grid';
import { FeatureBento } from '@/components/marketing/feature-bento';
import { HeroSection } from '@/components/marketing/hero-section';
import { SiteFooter } from '@/components/marketing/site-footer';
import { SiteHeader } from '@/components/marketing/site-header';
import { getAuthState } from '@/lib/auth/profile';

export const metadata: Metadata = {
  title: 'TaskPulse — Multi-Metric Performance Tracker',
  description:
    'Weight every task, log the hours against it, and measure each member against the team median. Task scale, scaled progress, productivity rates and freshness decay in one workspace.',
};

/**
 * Root route: marketing page for visitors, redirect for members.
 *
 * The profile check, not just the session, decides the redirect. An account that
 * is authenticated but has no `public.users` row would be bounced straight back
 * out of `/dashboard` by the guarded layout, so those visitors stay here and take
 * the sign-in route, which explains the problem.
 *
 * Reading cookies makes this route dynamic, so the landing page is server-rendered
 * per request rather than statically prerendered. That is the cost of having one
 * URL serve both audiences.
 */
export default async function HomePage() {
  const { profile } = await getAuthState();

  if (profile) {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <SiteHeader />

      {/* Skip link, since the header carries several links before the content. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-slate-900 focus:px-3 focus:py-2 focus:text-sm focus:text-slate-50"
      >
        Skip to content
      </a>

      <main id="main" className="flex-1">
        <HeroSection />
        <FeatureBento />
        {/* Occupies the slot a pricing matrix would take: security model, role
            governance and the performance arithmetic. */}
        <CapabilitiesGrid />
      </main>

      <SiteFooter />
    </div>
  );
}
