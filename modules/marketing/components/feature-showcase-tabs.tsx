'use client';

import * as React from 'react';
import Image from 'next/image';
import { CheckCircle2Icon } from 'lucide-react';

import { INTERACTIVE_TABS } from '@/modules/marketing/internal/content';
import { cn } from '@/shared/utils';

/**
 * Interactive Feature Showcase Tabs
 *
 * Inspired by Zoho Analytics' tabbed dashboard examples section.
 * Allows users to toggle between the 3 main workspace interfaces (Tasks,
 * Analytics, Effort Logs) with real screenshot imagery and contextual feature points.
 */
export function FeatureShowcaseTabs() {
  const [activeTabId, setActiveTabId] = React.useState<string>(
    INTERACTIVE_TABS[0]?.id ?? 'tab-tasks',
  );

  const activeTab =
    INTERACTIVE_TABS.find((t) => t.id === activeTabId) ?? INTERACTIVE_TABS[0]!;

  return (
    <section
      id="interactive-views"
      aria-labelledby="interactive-views-heading"
      className="border-border bg-slate-50/70 border-b py-20 [contain-intrinsic-size:auto_900px] [content-visibility:auto]"
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 text-center">
          <span className="badge-soft badge-accent">Interactive Workspace Views</span>
          <h2
            id="interactive-views-heading"
            className="text-foreground text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            Explore the core surfaces designed for high output
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg">
            Click across the views below to see how TaskPulse organizes tasks, measures
            performance against the median, and makes daily logging seamless.
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="mt-10 flex justify-center">
          <div
            role="tablist"
            aria-label="Workspace views"
            className="border-border inline-flex flex-wrap items-center justify-center gap-1.5 rounded-xl border bg-white p-1.5 shadow-sm"
          >
            {INTERACTIVE_TABS.map((tab) => {
              const isSelected = tab.id === activeTabId;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  type="button"
                  aria-selected={isSelected}
                  onClick={() => setActiveTabId(tab.id)}
                  className={cn(
                    'rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-150',
                    'focus-visible:ring-primary/40 focus-visible:ring-2 focus-visible:outline-none',
                    isSelected
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-slate-100 hover:text-foreground',
                  )}
                >
                  {tab.tabLabel}
                </button>
              );
            })}
          </div>
        </div>

        {/* Active View Container */}
        <div className="border-border mt-8 overflow-hidden rounded-2xl border bg-white shadow-soft-xl">
          <div className="grid items-center gap-8 p-6 lg:grid-cols-12 lg:p-10">
            {/* Left copy & bullets */}
            <div className="flex flex-col gap-5 lg:col-span-5">
              <span className="text-primary text-xs font-semibold tracking-wider uppercase">
                {activeTab.tabLabel}
              </span>
              <h3 className="text-foreground text-2xl font-semibold leading-snug sm:text-3xl">
                {activeTab.headline}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed sm:text-base">
                {activeTab.subtext}
              </p>

              <ul className="border-border flex flex-col gap-3 border-t pt-5">
                {activeTab.points.map((point) => (
                  <li key={point} className="flex items-start gap-2.5 text-sm">
                    <CheckCircle2Icon className="text-primary mt-0.5 size-4 shrink-0" />
                    <span className="text-foreground font-medium">{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Right preview image */}
            <div className="border-border relative overflow-hidden rounded-xl border bg-slate-900/5 shadow-inner lg:col-span-7">
              <div className="aspect-[16/10] w-full">
                <Image
                  src={activeTab.imageSrc}
                  alt={activeTab.imageAlt}
                  width={1120}
                  height={700}
                  className="h-full w-full object-cover object-top transition-transform duration-300 hover:scale-[1.01]"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
