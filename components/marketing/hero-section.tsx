import * as React from 'react';
import Link from 'next/link';
import { ArrowRightIcon } from 'lucide-react';

import { TrackerMockup } from '@/components/marketing/tracker-mockup';
import { Button } from '@/components/ui/button';
import { CTA, HERO, HERO_ASSURANCES, HERO_STATS } from '@/lib/marketing/content';

/**
 * Hero.
 *
 * Two columns from `lg` up, stacked below. Generous vertical rhythm and a white
 * surface on the off-white field, so the section reads as the top of a document
 * rather than a banner — the product is a data tool, and the page should look
 * like one.
 *
 * Two actions only. The primary opens the sign-up pane; the secondary jumps to
 * the architecture section, which is the honest counterpart to the "talk to
 * sales" button a commercial page would put here. Returning members use Sign In
 * in the header.
 */
export function HeroSection() {
  return (
    <section className="border-border border-b bg-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
          {/* Copy */}
          <div className="flex flex-col gap-7">
            <span className="badge-soft badge-accent w-fit">{HERO.eyebrow}</span>

            <div className="flex flex-col gap-5">
              {/*
                Sized to break onto three lines at the desktop width. The ampersand
                is the hinge of the sentence — capacity and velocity are the two
                things the product measures — so the line is allowed to be long.
              */}
              <h1 className="text-foreground text-4xl leading-[1.08] font-semibold sm:text-5xl lg:text-[3.25rem]">
                {HERO.headline}
              </h1>
              <p className="text-muted-foreground max-w-xl text-base leading-relaxed sm:text-lg">
                {HERO.subtext}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href={CTA.launch.href}>
                  {CTA.launch.label}
                  <ArrowRightIcon aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <a href={CTA.systemOverview.href}>{CTA.systemOverview.label}</a>
              </Button>
            </div>

            <ul className="text-muted-foreground border-border flex flex-col gap-2 border-t pt-6 text-sm sm:flex-row sm:flex-wrap sm:gap-x-6">
              {HERO_ASSURANCES.map((point) => (
                <li key={point} className="flex items-center gap-2">
                  {/*
                    A dot, not a tick. A checklist implies features being ticked
                    off a comparison table, which is the shape of a pricing page.
                  */}
                  <span
                    aria-hidden="true"
                    className="bg-primary size-1.5 shrink-0 rounded-full"
                  />
                  {point}
                </li>
              ))}
            </ul>
          </div>

          {/* Product preview */}
          <TrackerMockup />
        </div>

        {/* Metric strip */}
        <dl className="border-border mt-16 grid grid-cols-1 gap-8 border-t pt-10 sm:grid-cols-3">
          {HERO_STATS.map(({ value, label }) => (
            <div key={label} className="flex flex-col gap-1">
              <dt className="sr-only">{label}</dt>
              <dd className="stat-figure text-foreground text-3xl">{value}</dd>
              <dd className="text-muted-foreground text-sm">{label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
