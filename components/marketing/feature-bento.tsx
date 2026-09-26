import * as React from 'react';

import { PRIMARY_FEATURES, WORKFLOW_STEPS } from '@/lib/marketing/content';

/**
 * Feature grid and workflow.
 *
 * Three cards, one per measurement this product adds that a task list does not
 * have. Equal weight and equal size: none of the three is the headline, and a
 * mixed-size bento would have implied one was.
 *
 * The four-up supporting strip that used to sit below was removed. It restated the
 * security and role material that the capabilities section covers properly, and
 * saying it twice in different words weakened both.
 *
 * A Server Component: nothing here is interactive.
 */
export function FeatureBento() {
  return (
    <>
      <section
        id="features"
        aria-labelledby="features-heading"
        className="border-border bg-background border-b"
      >
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <div className="flex max-w-2xl flex-col gap-4">
            <span className="eyebrow text-primary">Features</span>
            <h2
              id="features-heading"
              className="text-foreground text-3xl font-semibold sm:text-4xl"
            >
              Three measurements most trackers leave out
            </h2>
            <p className="text-muted-foreground text-base leading-relaxed sm:text-lg">
              Task lists tell you what exists. These tell you what it cost, how it
              compares, and what has stopped moving.
            </p>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {PRIMARY_FEATURES.map(
              ({ id, title, summary, detail, points, icon: Icon }) => (
                <article
                  key={id}
                  className="soft-card flex flex-col gap-5 p-6"
                >
                  {/*
                    One mark per card, and it is load-bearing here rather than
                    decorative: three cards side by side need something that
                    distinguishes them at a glance before the headings are read.
                  */}
                  <span className="bg-primary-subtle text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>

                  <div className="flex flex-col gap-2">
                    <h3 className="text-foreground text-lg font-semibold tracking-tight">
                      {title}
                    </h3>
                    <p className="text-foreground text-sm font-medium">
                      {summary}
                    </p>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {detail}
                    </p>
                  </div>

                  <ul className="border-border mt-auto flex flex-col gap-2 border-t pt-4">
                    {points.map((point) => (
                      <li
                        key={point}
                        className="text-muted-foreground flex items-start gap-2 text-xs"
                      >
                        <span
                          aria-hidden="true"
                          className="bg-primary mt-1.5 size-1 shrink-0 rounded-full"
                        />
                        {point}
                      </li>
                    ))}
                  </ul>
                </article>
              ),
            )}
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section
        id="how-it-works"
        aria-labelledby="how-it-works-heading"
        className="border-border border-b bg-white"
      >
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <div className="flex max-w-2xl flex-col gap-4">
            <span className="eyebrow text-primary">How it works</span>
            <h2
              id="how-it-works-heading"
              className="text-foreground text-3xl font-semibold sm:text-4xl"
            >
              Three steps, then the numbers maintain themselves
            </h2>
          </div>

          <ol className="mt-10 grid gap-4 lg:grid-cols-3">
            {WORKFLOW_STEPS.map(({ step, title, description }) => (
              <li key={step} className="soft-card flex flex-col gap-3 p-6">
                <span className="bg-primary text-primary-foreground tabular flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold">
                  {step}
                </span>
                <h3 className="text-foreground text-lg font-semibold tracking-tight">
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
