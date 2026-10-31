'use client';

/**
 * Last resort when the root layout itself fails: it replaces the whole
 * document, so it brings its own html and body and plain inline styles.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f7f6fd', color: '#101113' }}>
        <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
          <div>
            <h1 style={{ fontSize: 20 }}>Stellar didn’t load</h1>
            <p style={{ fontSize: 14, opacity: 0.75 }}>
              Try again in a moment.{error.digest ? ` Reference ${error.digest}.` : ''}
            </p>
            <button type="button" onClick={() => reset()} style={{ minHeight: 40, padding: '0 20px', borderRadius: 12, border: 0, background: '#6355e6', color: '#fff', fontWeight: 600 }}>
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
