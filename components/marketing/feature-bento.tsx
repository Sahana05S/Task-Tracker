import * as React from 'react';
import { CheckIcon } from 'lucide-react';

import {
  PRIMARY_FEATURES,
  SUPPORTING_CAPABILITIES,
  WORKFLOW_STEPS,
} from '@/lib/marketing/content';

/**
 * Feature grid and workflow.
 *
 * Three tall cards for the headline capabilities, then a four-up strip of
 * supporting ones — the size difference is what gives the section its bento
 * rhythm without resorting to decoration.
 */
export function FeatureBento() {
  return (
    <>
      <section
        id="features"
        aria-labelledby="features-heading"
        className="border-b border-slate-200 bg-slate-50"
      >
        <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
          <div className="flex max-w-2xl flex-col gap-3">
            <span className="text-xs font-semibold tracking-wide text-sky-700 uppercase">
              Features
            </span>
            <h2
              id="features-heading"
              className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl"
            >
              Three measurements most trackers leave out
            </h2>
            <p className="text-base text-slate-600">
              Task lists tell you what exists. These tell you what it cost, how it
              compares, and what has stopped moving.
            </p>
          </div>

          {/* Primary cards */}
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {PRIMARY_FEATURES.map(
              ({ id, title, summary, detail, points, icon: Icon }) => (
                <article
                  key={id}
                  className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-5"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-slate-900 text-slate-50">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>

                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-base font-semibold text-slate-900">
                      {title}
                    </h3>
                    <p className="text-sm font-medium text-slate-700">
                      {summary}
                    </p>
                    <p className="text-sm text-slate-600">{detail}</p>
                  </div>

                  <ul className="mt-auto flex flex-col gap-1.5 border-t border-slate-100 pt-3">
                    {points.map((point) => (
                      <li
                        key={point}
                        className="flex items-start gap-2 text-xs text-slate-600"
                      >
                        <CheckIcon
                          className="mt-0.5 size-3.5 shrink-0 text-emerald-600"
                          aria-hidden="true"
                        />
                        {point}
                      </li>
                    ))}
                  </ul>
                </article>
              ),
            )}
          </div>

          {/* Supporting strip */}
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {SUPPORTING_CAPABILITIES.map(
              ({ id, title, description, icon: Icon }) => (
                <article
                  key={id}
                  className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <h3 className="text-sm font-medium text-slate-900">{title}</h3>
                  <p className="text-xs text-slate-600">{description}</p>
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
        className="border-b border-slate-200 bg-white"
      >
        <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
          <div className="flex max-w-2xl flex-col gap-3">
            <span className="text-xs font-semibold tracking-wide text-sky-700 uppercase">
              How it works
            </span>
            <h2
              id="how-it-works-heading"
              className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl"
            >
              Three steps, then the numbers maintain themselves
            </h2>
          </div>

          <ol className="mt-8 grid gap-4 lg:grid-cols-3">
            {WORKFLOW_STEPS.map(({ step, title, description }) => (
              <li
                key={step}
                className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-5"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-sm font-semibold text-slate-900 [font-variant-numeric:tabular-nums]">
                  {step}
                </span>
                <h3 className="text-base font-semibold text-slate-900">
                  {title}
                </h3>
                <p className="text-sm text-slate-600">{description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
