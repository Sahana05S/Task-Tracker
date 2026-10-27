# Browser tests (Playwright)

Vitest (`npm test`) covers logic in `__tests__/` and `modules/*/__tests__/`.
This folder is the browser suite.

| Project | Needs | What it checks |
|---|---|---|
| `public`, `public-mobile` | nothing | landing, sign-in, password reset, redirect guard, the edge guard on every workspace page, API refusals, route inventory |
| `setup` | QA accounts | signs each account in once (`playwright/.auth/`, gitignored) |
| `md`, `member`, `member-mobile` | QA accounts | opens every workspace page as that role: no crash, no 5xx, no console errors, refused where the role may not go, no sideways scroll on a phone |

Everything is read-only: nothing presses a button that saves.

## Run

```bash
npx playwright test --project=public --project=public-mobile
```

Without `E2E_BASE_URL` it reuses (or starts) `npm run dev` on port 3000.
To check the deployed demo: `E2E_BASE_URL=https://task-tracker-gules-ten.vercel.app`.

Signed-in runs need **test accounts only**, never a real person's:

```bash
QA_MD_EMAIL=... QA_MD_PASSWORD=... QA_MEMBER_EMAIL=... QA_MEMBER_PASSWORD=... npx playwright test
```

A role without its variables is skipped. Keep the values out of the repo
(shell, `.env.*.local`, or CI secrets).

## Adding a page

`tests/e2e/routes.ts` lists every page under `app/(workspace)` with who may
open it. `route-inventory.spec.ts` fails until a new page is listed there.

Reports: `npx playwright show-report`; traces, screenshots and video are kept
for failures in `test-results/`.
