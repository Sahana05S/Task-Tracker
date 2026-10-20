# marketing

## What it does
The public landing page at `/`: header, a space-themed hero (night sky, stars,
low-poly planet, rocket and a cloud bank that clears into the page on scroll)
with the tracker mockup, the metric strip, feature rows, feature tabs, FAQ and
a footer whose call to action sits on a small night sky. It is static content
with no data access, in the existing TaskPulse palette (no theme switch).

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | The landing page sections: `SiteHeader`, `HeroSection`, `FeatureShowcaseTabs`, `FeatureBento`, `FeatureFAQ`, `SiteFooter` |
| `components/` | The section components themselves (rendered by `app/page.tsx` through `index.ts`), plus `metric-strip.tsx` |
| `components/space/` | Decorative art used by the hero and footer: `SkyBackdrop`, `StarField`, `LowPolyPlanet`, `Rocket`, `CloudBank`, and `space.module.css` (art colours, keyframes, scroll-linked parallax, the header's transparent-to-white switch) |

## Private (`internal/`)
| File | Job |
|---|---|
| `content.ts` | Landing page copy: navigation, hero (with `headlineAccent`), stats, feature tabs, workflow steps, FAQs, footer links and CTA targets |
| `space/stars.ts` | Seeded PRNG and star field (`seededStars`), so server and client render the same sky |
| `space/geometry.ts` | Low-poly planet mesh (`planetFacets`), cloud puff rows (`cloudPuffs`), colour ramp |
| `space/layers.ts` | Cloud layer speeds and the capped parallax travel (`CLOUD_LAYERS`, `parallaxTravel`, `layerStyle`) |

## Motion and accessibility
- All art is `aria-hidden` with no pointer events; the headline stays the
  largest contentful element.
- Idle motion (twinkle, rocket float, flame, cloud drift) runs only under
  `prefers-reduced-motion: no-preference`.
- Scroll parallax uses CSS scroll-driven animations inside
  `@supports (animation-timeline: scroll())`. Browsers without them show the
  same art, static, and a white header throughout.
- Cloud travel is capped at 35vh so the clouds never reach the headline while
  it is on screen.

## Database it owns
None. The page only reads the auth state (via `shared/session`) in `app/page.tsx`
to redirect signed-in users to `/today`.

## Depends on
`shared/ui` (button, sheet), `shared/utils` (`cn`). No other modules.
Images are served from `public/images/marketing/`.

## Tests
`__tests__/space-art.test.ts` covers the deterministic star field, planet mesh,
cloud puffs and the parallax clamp.
