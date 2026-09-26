import * as React from 'react';
import Link from 'next/link';
import { ArrowRightIcon, CheckIcon } from 'lucide-react';

import { TrackerMockup } from '@/components/marketing/tracker-mockup';
import { Button } from '@/components/ui/button';
import { CTA, HERO_ASSURANCES, HERO_STATS } from '@/lib/marketing/content';

/**
 * Hero.
 *
 * Two columns from `lg` up, stacked below. Kept on the flat sheet palette — white
 * surfaces, slate text, a single sky accent — rather than a gradient wash, so the
 * page looks like the product it is describing.
 *
 * Both buttons lead into `/login`: one to the sign-up pane, one to sign-in. The
 * quieter third link jumps to the capabilities section rather than opening a
 * sales conversation.
 */
export function HeroSection() {
  return (
    <section className="border-b border-slate-200 bg-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
          {/* Copy */}
          <div className="flex flex-col gap-6">
            <span className="badge-soft badge-neutral w-fit">
              Multi-metric performance tracking
            </span>

            <div className="flex flex-col gap-4">
              <h1 className="text-3xl leading-tight font-semibold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
                Know what your team actually delivered, not just what they were
                busy with.
              </h1>
              <p className="max-w-xl text-base text-slate-600">
                TaskPulse weights every task, records the hours against it, and
                measures each member against the team median. Progress becomes a
                figure you can defend in a review, not an impression.
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
                <Link href={CTA.signIn.href}>{CTA.signIn.label}</Link>
              </Button>
              <a
                href={CTA.capabilities.href}
                className="rounded-md px-1 text-sm font-medium text-sky-700 underline-offset-4 transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-sky-500/40 focus-visible:outline-none"
              >
                {CTA.capabilities.label}
              </a>
            </div>

            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
              {HERO_ASSURANCES.map((point) => (
                <li key={point} className="flex items-center gap-1.5">
                  <CheckIcon
                    className="size-4 shrink-0 text-emerald-600"
                    aria-hidden="true"
                  />
                  {point}
                </li>
              ))}
            </ul>
          </div>

          {/* Product preview */}
          <div className="lg:pl-4">
            <TrackerMockup />
          </div>
        </div>

        {/* Metric strip */}
        <dl className="mt-12 grid grid-cols-1 gap-4 border-t border-slate-200 pt-8 sm:grid-cols-3">
          {HERO_STATS.map(({ value, label, icon: Icon }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <div className="flex flex-col">
                <dt className="sr-only">{label}</dt>
                <dd className="text-xl font-semibold text-slate-900 [font-variant-numeric:tabular-nums]">
                  {value}
                </dd>
                <dd className="text-sm text-slate-500">{label}</dd>
              </div>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
