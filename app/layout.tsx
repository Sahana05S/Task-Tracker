import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';

import { Toaster } from '@/shared/ui/sonner';
import './globals.css';

/**
 * Plus Jakarta Sans, self-hosted by `next/font` (the redesign's single family).
 *
 * Exposed as a CSS variable so `--font-sans` in `globals.css` keeps a system
 * fallback stack behind it: a failed font fetch degrades to the platform UI font.
 * `display: 'swap'` renders the fallback immediately.
 */
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
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
    <html lang="en" className={`${jakarta.variable} font-sans`}>
      <body className="bg-background text-foreground min-h-dvh antialiased">
        {children}
        {/* Mounted once at the root so Server Action outcomes can be reported
            from anywhere, including the public pages. */}
        <Toaster />
      </body>
    </html>
  );
}
