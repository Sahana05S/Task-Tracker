import * as React from 'react';
import Image from 'next/image';
import { CheckCircle2Icon } from 'lucide-react';

import { SHOWCASE_FEATURES, WORKFLOW_STEPS } from '@/lib/marketing/content';
import { cn } from '@/shared/utils';

/**
 * Feature Showcase & Workflow (Zoho-Style Z-Pattern Layout)
 *
 * Replaces dense text cards with rich alternating feature showcases featuring
 * full product screenshots and concise capability bullet points.
 */
export function FeatureBento() {
  return (
    <>
      {/* Alternating Feature Rows */}
      <section
        id="features"
        aria-labelledby="features-heading"
        className="border-border bg-white border-b py-20 lg:py-28"
      >
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 text-center">
            <span className="badge-soft badge-accent">Core Capabilities</span>
            <h2
              id="features-heading"
              className="text-foreground text-3xl font-semibold tracking-tight sm:text-4xl"
            >
              Everything you need to run high-velocity task tracking
            </h2>
            <p className="text-muted-foreground text-base sm:text-lg">
              Designed around scale, velocity, and fair workload distribution.
              No arbitrary status meetings or opaque spreadsheets.
            </p>
          </div>

          <div className="mt-16 flex flex-col gap-24 lg:gap-32">
            {SHOWCASE_FEATURES.map((feature, idx) => {
              const isImageLeft = feature.imagePosition === 'left';
              const Icon = feature.icon;

              return (
                <div
                  key={feature.id}
                  className="grid items-center gap-10 lg:grid-cols-12 lg:gap-14"
                >
                  {/* Text Content */}
                  <div
                    className={cn(
                      'flex flex-col gap-5 lg:col-span-5',
                      isImageLeft ? 'lg:order-2' : 'lg:order-1',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg">
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <span className="text-primary text-xs font-semibold tracking-wide uppercase">
                        {feature.badge}
                      </span>
                    </div>

                    <h3 className="text-foreground text-2xl font-semibold leading-tight sm:text-3xl">
                      {feature.title}
                    </h3>

                    <p className="text-muted-foreground text-base leading-relaxed">
                      {feature.description}
                    </p>

                    <ul className="border-border flex flex-col gap-3 border-t pt-5">
                      {feature.highlights.map((point) => (
                        <li key={point} className="flex items-start gap-3 text-sm">
                          <CheckCircle2Icon className="text-primary mt-0.5 size-4 shrink-0" />
                          <span className="text-foreground font-medium">{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Screenshot Image Frame */}
                  <div
                    className={cn(
                      'border-border overflow-hidden rounded-2xl border bg-slate-900/5 shadow-soft-xl lg:col-span-7',
                      isImageLeft ? 'lg:order-1' : 'lg:order-2',
                    )}
                  >
                    <div className="aspect-[16/10] w-full overflow-hidden">
                      <Image
                        src={feature.imageSrc}
                        alt={feature.imageAlt}
                        width={1120}
                        height={700}
                        className="h-full w-full object-cover object-top transition-transform duration-300 hover:scale-[1.02]"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Workflow / How It Works */}
      <section
        id="how-it-works"
        aria-labelledby="how-it-works-heading"
        className="border-border bg-slate-50/70 border-b py-20 lg:py-24"
      >
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
            <span className="badge-soft badge-accent">Streamlined Workflow</span>
            <h2
              id="how-it-works-heading"
              className="text-foreground text-3xl font-semibold tracking-tight sm:text-4xl"
            >
              Three steps from task creation to objective clarity
            </h2>
            <p className="text-muted-foreground text-base">
              A simple, disciplined routine that keeps your metrics accurate without extra overhead.
            </p>
          </div>

          <ol className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {WORKFLOW_STEPS.map(({ step, title, description }) => (
              <li
                key={step}
                className="soft-card flex flex-col gap-4 rounded-xl border bg-white p-7 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <span className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold">
                    0{step}
                  </span>
                  <span className="text-muted-foreground text-xs font-mono font-medium">
                    STEP {step}
                  </span>
                </div>
                <h3 className="text-foreground text-xl font-semibold tracking-tight">
                  {title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {description}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
