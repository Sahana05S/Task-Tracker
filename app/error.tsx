'use client';

import Link from 'next/link';

/**
 * A failure outside the workspace (landing, sign-in, password reset): stated
 * as such, with a way back, instead of Next's unstyled default.
 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="bg-background text-foreground flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-bold tracking-tight">This page didn’t load</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Try again in a moment.
          {error.digest ? <> If it keeps happening, quote reference <span className="font-mono">{error.digest}</span>.</> : null}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button type="button" onClick={() => reset()} className="bg-primary text-primary-foreground hover:bg-primary-hover min-h-10 rounded-xl px-5 text-sm font-semibold">
            Try again
          </button>
          <Link href="/login" className="border-border bg-card hover:bg-muted inline-flex min-h-10 items-center rounded-xl border px-5 text-sm font-semibold">
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
