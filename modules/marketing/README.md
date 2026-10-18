# marketing

## What it does
The public landing page at `/`: header, hero with the tracker mockup, feature
tabs, feature bento, FAQ and footer. It is static content with no data access.

## Public API (the only files other code may import)
| File | What it offers |
|---|---|
| `index.ts` | The landing page sections: `SiteHeader`, `HeroSection`, `FeatureShowcaseTabs`, `FeatureBento`, `FeatureFAQ`, `SiteFooter` |
| `components/` | The section components themselves (rendered by `app/page.tsx` through `index.ts`) |

## Private (`internal/`)
| File | Job |
|---|---|
| `content.ts` | Landing page copy: navigation, hero, stats, feature tabs, workflow steps, FAQs, footer links and CTA targets |

## Database it owns
None. The page only reads the auth state (via `shared/session`) in `app/page.tsx`
to redirect signed-in users to `/today`.

## Depends on
`shared/ui` (button, sheet), `shared/utils` (`cn`). No other modules.
Images are served from `public/images/marketing/`.
