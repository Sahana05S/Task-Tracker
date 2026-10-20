'use client';

import * as React from 'react';
import Link from 'next/link';
import { MenuIcon } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/shared/ui/sheet';
import spaceStyles from '@/modules/marketing/components/space/space.module.css';
import { CTA, MARKETING_NAV } from '@/modules/marketing/internal/content';
import { cn } from '@/shared/utils';

/**
 * Landing page header.
 *
 * Sticky, with a hairline border rather than a shadow so it sits in the same
 * visual language as the workspace chrome. Navigation collapses into a sheet below
 * the `md` breakpoint, which is where the inline links stop fitting alongside both
 * calls to action.
 *
 * The brand mark is the same `TP` monogram the workspace rail uses, rather than a
 * separate logo glyph — a visitor who signs in should recognise where they landed.
 *
 * It floats over the hero's night sky: transparent with white text at the top
 * of the page, the usual white bar once the page has scrolled (a scroll-linked
 * colour change in `space.module.css`). Text inherits the header's colour so
 * both states read correctly; browsers without scroll timelines keep the white
 * bar throughout.
 */
export function SiteHeader() {
  const [menuOpen, setMenuOpen] = React.useState(false);

  return (
    <header className={cn(spaceStyles.header, 'sticky top-0 z-40')}>
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="focus-visible:ring-primary/30 flex items-center gap-2.5 rounded-md focus-visible:ring-2 focus-visible:outline-none"
        >
          <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold">
            TP
          </span>
          <span className="text-sm font-semibold tracking-tight">
            TaskPulse
          </span>
        </Link>

        <nav aria-label="Main" className="ml-6 hidden md:block">
          <ul className="flex items-center gap-1">
            {MARKETING_NAV.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="focus-visible:ring-primary/40 rounded-md px-3 py-1.5 text-sm font-medium opacity-80 transition-opacity hover:bg-current/10 hover:opacity-100 focus-visible:ring-2 focus-visible:outline-none"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden text-current opacity-80 hover:bg-current/10 hover:text-current hover:opacity-100 sm:inline-flex"
          >
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
              <nav aria-label="Mobile" className="px-3">
                <ul className="flex flex-col gap-1">
                  {MARKETING_NAV.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        onClick={() => setMenuOpen(false)}
                        className="nav-item"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                  <li className="border-border mt-2 border-t pt-2">
                    <Link
                      href={CTA.signIn.href}
                      onClick={() => setMenuOpen(false)}
                      className="nav-item"
                    >
                      {CTA.signIn.label}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href={CTA.launch.href}
                      onClick={() => setMenuOpen(false)}
                      className="nav-item"
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
