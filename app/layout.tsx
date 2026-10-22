import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';

import { Toaster } from '@/shared/ui/sonner';
import { ThemeProvider } from '@/shared/ui/theme';
import { THEME_COLOR, THEME_SCRIPT } from '@/shared/ui/theme-script';
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
    /*
      `data-theme` starts light and the inline script swaps it before the first
      paint, so <html> legitimately differs from the server markup.
    */
    <html lang="en" data-theme="light" className={`${jakarta.variable} font-sans`} suppressHydrationWarning>
      <head>
        {/* Before the script, which points it at the painted theme's background. */}
        <meta name="theme-color" content={THEME_COLOR.light} />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="bg-background text-foreground min-h-dvh antialiased">
        <ThemeProvider>
          {children}
          {/* Mounted once at the root so Server Action outcomes can be reported
              from anywhere, including the public pages. */}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
