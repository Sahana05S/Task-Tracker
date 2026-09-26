'use client';

import * as React from 'react';
import Link from 'next/link';
import { GaugeIcon, MenuIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { CTA, MARKETING_NAV } from '@/lib/marketing/content';

/**
 * Landing page header.
 *
 * Sticky, with a hairline border rather than a shadow so it sits in the same
 * visual language as the workspace chrome. Navigation collapses into a sheet
 * below the `md` breakpoint, which is where the inline links stop fitting
 * alongside both calls to action.
 */
export function SiteHeader() {
  const [menuOpen, setMenuOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md focus-visible:ring-2 focus-visible:ring-sky-500/40 focus-visible:outline-none"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-slate-900 text-slate-50">
            <GaugeIcon className="size-4" aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold text-slate-900">TaskPulse</span>
        </Link>

        <nav aria-label="Main" className="ml-4 hidden md:block">
          <ul className="flex items-center gap-1">
            {MARKETING_NAV.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-sky-500/40 focus-visible:outline-none"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href={CTA.signIn.href}>{CTA.signIn.label}</Link>
          </Button>
          {/* Shorter label than the hero uses: the bar has to hold both actions
              and the menu button at small widths. */}
          <Button asChild size="sm">
            <Link href={CTA.getStarted.href}>{CTA.getStarted.label}</Link>
          </Button>

          {/* Mobile navigation */}
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="md:hidden"
                aria-label="Open navigation"
              >
                <MenuIcon aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <nav aria-label="Mobile" className="px-4">
                <ul className="flex flex-col gap-1">
                  {MARKETING_NAV.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        onClick={() => setMenuOpen(false)}
                        className="block rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                  <li className="mt-2 border-t border-slate-200 pt-2">
                    <Link
                      href={CTA.signIn.href}
                      onClick={() => setMenuOpen(false)}
                      className="block rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                    >
                      {CTA.signIn.label}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href={CTA.launch.href}
                      onClick={() => setMenuOpen(false)}
                      className="block rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                    >
                      {CTA.launch.label}
                    </Link>
                  </li>
                </ul>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
