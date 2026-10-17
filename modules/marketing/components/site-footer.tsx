import * as React from 'react';
import Link from 'next/link';
import { ArrowRightIcon } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import { CTA, FOOTER_COLUMNS } from '@/modules/marketing/internal/content';

/**
 * Closing call to action and footer.
 *
 * Internal destinations use `next/link` for client navigation; in-page anchors and
 * `mailto:` addresses stay as plain anchors, since the router has nothing to
 * prefetch for either.
 */
export function SiteFooter() {
  return (
    <footer className="bg-white">
      {/* High-impact Closing CTA (Zoho style) */}
      <div className="bg-[#312d46] text-white py-16 lg:py-20">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-8 px-4 text-center sm:px-6 lg:flex-row lg:text-left">
          <div className="flex flex-col gap-3">
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Ready to take control of your team&apos;s delivery velocity?
            </h2>
            <p className="max-w-2xl text-base text-slate-200">
              Start weighting tasks, tracking real effort, and benchmark progress against
              the team median today.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button
              asChild
              size="lg"
              className="bg-emerald-500 text-slate-950 hover:bg-emerald-400 font-semibold shadow-lg"
            >
              <Link href={CTA.launch.href}>
                {CTA.launch.label}
                <ArrowRightIcon aria-hidden="true" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              <Link href={CTA.signIn.href}>{CTA.signIn.label}</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Link columns */}
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        {/* Brand block plus three link columns. */}
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-3">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold">
                TP
              </span>
              <span className="text-foreground text-sm font-semibold tracking-tight">
                TaskPulse
              </span>
            </Link>
            <p className="text-muted-foreground max-w-xs text-xs leading-relaxed">
              Advanced multi-metric performance tracker for teams that need their
              delivery figures to hold up.
            </p>
          </div>

          {FOOTER_COLUMNS.map((column) => (
            <nav
              key={column.heading}
              aria-labelledby={`footer-${column.heading}`}
            >
              <h3 id={`footer-${column.heading}`} className="eyebrow">
                {column.heading}
              </h3>
              <ul className="mt-3 flex flex-col gap-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    {link.href.startsWith('/') ? (
                      <Link
                        href={link.href}
                        className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                      >
                        {link.label}
                      </Link>
                    ) : (
                      <a
                        href={link.href}
                        className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                      >
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="border-border mt-10 flex flex-col gap-2 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-xs">
            © {new Date().getFullYear()} TaskPulse. All rights reserved.
          </p>
        </div>

        {/*
          Privacy and terms are reachable by email rather than as hosted pages.
          Linking to routes that do not exist would be worse than saying where the
          documents actually come from.
        */}
        <p className="text-muted-foreground mt-2 text-xs">
          Privacy notice and terms of service available on request at{' '}
          <a
            href="mailto:legal@taskpulse.example"
            className="hover:text-foreground underline underline-offset-2 transition-colors"
          >
            legal@taskpulse.example
          </a>
          .
        </p>
      </div>
    </footer>
  );
}
