import * as React from 'react';
import Link from 'next/link';
import { ArrowRightIcon, SparklesIcon } from 'lucide-react';

import { CloudBank } from '@/modules/marketing/components/space/cloud-bank';
import { LowPolyPlanet } from '@/modules/marketing/components/space/low-poly-planet';
import { Rocket } from '@/modules/marketing/components/space/rocket';
import { SkyBackdrop } from '@/modules/marketing/components/space/sky-backdrop';
import spaceStyles from '@/modules/marketing/components/space/space.module.css';
import { TrackerMockup } from '@/modules/marketing/components/tracker-mockup';
import { CTA, HERO, HERO_ASSURANCES } from '@/modules/marketing/internal/content';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/utils';

/** Splits the headline so its last word can carry the accent gradient. */
function splitHeadline(headline: string, accent: string): [string, string] {
  return headline.endsWith(accent)
    ? [headline.slice(0, headline.length - accent.length), accent]
    : [headline, ''];
}

/**
 * Hero: a night sky over a cloud bank.
 *
 * Layers, back to front: sky and stars, the planet and the rocket, the cloud
 * bank, then the copy and the product window. The copy is centred in a column
 * that leaves the side gutters to the planet (top right) and rocket (left), so
 * neither ever sits on text, and the product window sits above the clouds like
 * a screen floating over the cloud deck. As the page scrolls the clouds rise
 * and clear into the white sections below (see `space.module.css`).
 *
 * The hero pulls itself up under the sticky header (`-mt-16`), which is
 * transparent over the sky and turns white once the page has scrolled.
 */
export function HeroSection() {
  const [lead, accent] = splitHeadline(HERO.headline, HERO.headlineAccent);

  return (
    <section
      aria-labelledby="hero-heading"
      className={cn(spaceStyles.hero, 'relative isolate -mt-16 overflow-hidden')}
    >
      <SkyBackdrop />

      <LowPolyPlanet className="-top-16 -right-28 w-[17rem] sm:-top-20 sm:-right-24 sm:w-[24rem] lg:-top-24 lg:-right-20 lg:w-[32rem]" />

      {/* Small rocket in the band above the eyebrow on narrow screens; a larger
          one in the left gutter once the gutter is wide enough to hold it. */}
      <Rocket id="tp-rocket-sm" className="top-[4.75rem] left-5 w-8 sm:left-10 sm:w-9 xl:hidden" />
      <Rocket
        id="tp-rocket-lg"
        parallax
        className="top-[38%] left-[5%] hidden w-24 xl:block 2xl:left-[9%]"
      />

      <CloudBank />

      <div className="relative z-20 mx-auto w-full max-w-6xl px-4 pt-40 pb-32 sm:px-6 sm:pt-40 sm:pb-40 lg:pt-44 lg:pb-44">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-7 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-[var(--hero-muted)] ring-1 ring-white/15 backdrop-blur-sm">
            <SparklesIcon aria-hidden="true" className="size-3.5 text-[#f5a623]" />
            {HERO.eyebrow}
          </span>

          <div className="flex flex-col gap-5">
            <h1
              id="hero-heading"
              className="text-4xl leading-[1.08] font-semibold tracking-tight text-white sm:text-5xl lg:text-[3.6rem]"
            >
              {lead}
              {accent ? <span className={spaceStyles.accent}>{accent}</span> : null}
            </h1>
            <p className="mx-auto max-w-2xl text-base leading-relaxed text-[var(--hero-muted)] sm:text-lg">
              {HERO.subtext}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="shadow-[0_8px_30px_-6px_rgb(99_85_230/0.7)]">
              <Link href={CTA.launch.href}>
                {CTA.launch.label}
                <ArrowRightIcon aria-hidden="true" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-white/25 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 hover:text-white"
            >
              <a href={CTA.exploreFeatures.href}>{CTA.exploreFeatures.label}</a>
            </Button>
          </div>

          <ul className="flex flex-col items-center gap-2 border-t border-white/15 pt-6 text-sm text-[var(--hero-muted)] sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-6">
            {HERO_ASSURANCES.map((point) => (
              <li key={point} className="flex items-center gap-2">
                {/* A dot, not a tick: these are qualities, not a feature checklist. */}
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-[#6ee7c8]" />
                {point}
              </li>
            ))}
          </ul>
        </div>

        {/* Product window, floating above the cloud deck. */}
        <div className="relative z-30 mx-auto mt-14 w-full max-w-5xl min-w-0 rounded-3xl border border-white/15 bg-white/10 p-1.5 shadow-[0_30px_80px_-20px_rgb(17_14_38/0.8)] backdrop-blur-md sm:mt-16 sm:p-2">
          <TrackerMockup />
        </div>
      </div>
    </section>
  );
}
