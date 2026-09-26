import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import { Toaster } from '@/components/ui/sonner';
import './globals.css';

/**
 * Inter, self-hosted by `next/font`.
 *
 * Exposed as a CSS variable rather than a class so `--font-sans` in
 * `globals.css` can put a fallback stack behind it — the variable resolves to
 * `var(--font-inter), ui-sans-serif, system-ui, …`, which means a failed font
 * fetch degrades to the platform UI font instead of to a serif.
 *
 * Variable by default, so every weight the interface uses comes from one file and
 * no synthetic bolding happens. `display: 'swap'` renders the fallback
 * immediately; on a data-dense page, text arriving late is worse than text
 * arriving in the wrong face for a moment.
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'TaskPulse',
  description: 'Advanced Multi-Metric Performance Tracker',
};

export default function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    /*
      `font-sans` sits on <html> so the family is inherited by everything,
      including the overlays Radix portals into <body> from outside the React tree
      below.
    */
    <html lang="en" className={`${inter.variable} font-sans`}>
      <body className="bg-background text-foreground min-h-dvh antialiased">
        {children}
        {/* Mounted once at the root so Server Action outcomes can be reported
            from anywhere, including the public pages. */}
        <Toaster />
      </body>
    </html>
  );
}
