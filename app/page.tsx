import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import {
  FeatureBento,
  FeatureFAQ,
  FeatureShowcaseTabs,
  HeroSection,
  SiteFooter,
  SiteHeader,
} from '@/modules/marketing';
import { getAuthState } from '@/shared/session/profile';

export const metadata: Metadata = {
  title: 'Stellar — Multi-Metric Performance Tracker & Capacity Analytics',
  description:
    'Weight every task, log daily effort, and measure individual velocity against the team median. Real-time task progress, productivity rates, and freshness decay in one workspace.',
};

/**
 * Root marketing landing page.
 *
 * Designed around high-impact business dashboard platforms (Zoho Analytics style).
 * Highlights product features, interactive views, real screenshots, and clear
 * capability workflows while keeping technical database formulas out of the way.
 */
export default async function HomePage() {
  const { profile } = await getAuthState();

  if (profile) {
    redirect('/today');
  }

  return (
    <div className="bg-background flex min-h-dvh w-full max-w-full flex-col overflow-x-clip">
      <SiteHeader />

      {/* Skip link for accessibility */}
      <a
        href="#main"
        className="focus:bg-primary focus:text-primary-foreground sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>

      <main id="main" className="flex-1">
        {/* Hero Section with interactive TrackerMockup retained */}
        <HeroSection />

        {/* Alternating Feature Showcase Rows with full screenshots */}
        <FeatureBento />

        {/* Interactive Feature Tabs Showcase (Zoho dashboard switcher pattern) */}
        <FeatureShowcaseTabs />

        {/* Feature & Product FAQ */}
        <FeatureFAQ />
      </main>

      {/* Closing CTA & Footer */}
      <SiteFooter />
    </div>
  );
}
