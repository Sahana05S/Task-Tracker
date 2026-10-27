import { SplashControls } from '@/shared/ui/splash-controls';
import { StellarMark } from '@/shared/ui/stellar-mark';

/** Seven sparks in the chart palette, evenly spread around the centre. */
const SPARKS = Array.from({ length: 7 }, (_, index) => ({
  colour: `var(--chart-${index + 1})`,
  angle: `${(360 / 7) * index}deg`,
  delay: `${index * 45}ms`,
}));

/**
 * "Opening Stellar": the overlay shown once per sign-in while the workspace
 * loads (27 October 2026, ported from the Catalyst tracker). Act 1: sparks
 * converge into a dot, a ring expands and the wordmark settles with its line.
 * Act 2: the company's own name arrives under the mark. The whole thing is
 * CSS; `SPLASH_SCRIPT` decides whether it plays at all (never under
 * automation or reduced motion, once per tab session) and `SplashControls`
 * lets the viewer skip it. Decorative: `role="status"` names it and nothing
 * else is announced.
 */
export function Splash({ companyName }: { companyName?: string | null }) {
  const name = companyName?.trim() || 'Stellar';
  return (
    <div id="app-splash" role="status" aria-label="Opening Stellar" className="splash bg-background fixed inset-0 z-[100] items-center justify-center overflow-hidden">
      <div aria-hidden="true" className="splash-glow absolute inset-0" />
      <div aria-hidden="true" className="splash-act1 relative flex size-72 items-center justify-center">
        {SPARKS.map((spark) => (
          <span
            key={spark.angle}
            className="splash-spark absolute size-3 rounded-full"
            style={{ background: spark.colour, '--a': spark.angle, animationDelay: spark.delay } as React.CSSProperties}
          />
        ))}
        <span className="splash-ring border-primary absolute size-24 rounded-full border-4" />
        <span className="splash-core bg-primary absolute size-5 rounded-full" />
        <span className="splash-word text-foreground absolute text-[clamp(2.5rem,9vw,4.25rem)] font-semibold tracking-tight">Stellar</span>
        <span className="splash-tag text-muted-foreground absolute top-[calc(50%+3.25rem)] text-sm font-medium whitespace-nowrap">A clear path through your work.</span>
      </div>
      <div aria-hidden="true" className="splash-act2 absolute flex flex-col items-center gap-3">
        <StellarMark className="size-16 rounded-2xl" />
        <span className="text-foreground max-w-[min(80vw,28rem)] truncate text-center text-2xl font-bold tracking-tight">{name}</span>
        {name !== 'Stellar' ? <span className="text-muted-foreground text-xs font-medium">Powered by Stellar</span> : null}
      </div>
      <SplashControls />
    </div>
  );
}
