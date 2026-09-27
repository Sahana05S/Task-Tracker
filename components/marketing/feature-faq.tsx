import * as React from 'react';
import { FAQS } from '@/lib/marketing/content';

/**
 * Customer & Feature FAQ Section
 *
 * Inspired by Zoho's business dashboard FAQ. Explains practical concepts
 * (task scale, freshness decay, median tracking) clearly without code dumps or
 * internal database formulas.
 */
export function FeatureFAQ() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="border-border bg-white border-b py-20 lg:py-24"
    >
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
          <span className="badge-soft badge-accent">Got Questions?</span>
          <h2
            id="faq-heading"
            className="text-foreground text-3xl font-semibold tracking-tight sm:text-4xl"
          >
            Frequently Asked Questions
          </h2>
          <p className="text-muted-foreground text-base">
            Everything you need to know about how TaskPulse organizes and measures work.
          </p>
        </div>

        <div className="mt-12 flex flex-col divide-y divide-slate-200 border-y border-slate-200">
          {FAQS.map((faq, index) => (
            <div key={index} className="py-6 sm:py-8">
              <h3 className="text-foreground text-lg font-semibold tracking-tight">
                {faq.question}
              </h3>
              <p className="text-muted-foreground mt-3 text-sm leading-relaxed sm:text-base">
                {faq.answer}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
