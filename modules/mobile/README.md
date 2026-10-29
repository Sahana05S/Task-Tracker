# mobile

The web side of the Android app (M20, DECISIONS "M20 mobile app", 29 October
2026). The app is a Capacitor shell (`Sahana05S/stellar-mobile`) that loads
this site, so every deploy updates it. This module is the bridge to the shell:
it does nothing in a browser.

## What it does
`NativeBridge`, mounted once in the signed-in workspace layout, checks for the
shell's `window.Capacitor` and only then loads the Capacitor packages:

- **Phone notifications:** asks once for permission, registers with Firebase
  Cloud Messaging and saves the token for the signed-in member on every start
  (`registerDeviceAction` -> `device_register`, migration 91). A notification
  received while the app is open makes the bell re-read its count
  (`stellar:notifications-changed`); a tapped one opens its `href` (in-app
  paths only, else the dashboard).
- **Back button:** closes an open dialog or menu, else goes back, else
  minimises the app.
- **Status bar:** below the page, in the Light/Dark theme colour, following
  theme changes.

`printPage()` prints through the shell's `NativePrint` plugin (Android's
print service, which offers Save as PDF) because Android WebView ignores
`window.print()`; in a browser it is `window.print()`. `forgetThisDevice()`
runs before sign-out (`device_unregister`), waiting at most three seconds.

## Public API
| File | What it offers |
|---|---|
| `index.ts` | Everything in `client.ts` (no server reads) |
| `actions.ts` | `registerDeviceAction(token, platform)`, `unregisterDeviceAction(token)` |
| `client.ts` | `isNativeApp()`, `printPage()`, `forgetThisDevice()`, `tapPath(data)`, `backAction(...)` |
| `components/native-bridge.tsx` | `NativeBridge` |

## Private (`internal/`)
| File | Job |
|---|---|
| `commands.ts` | `device_register`, `device_unregister` RPCs |
| `native.ts` | Browser-side helpers: app detection, print, stored token, sign-out cleanup |
| `rules.ts` | Token and platform checks, tap path, back-button decision |

## Database it uses
`device_register(token, platform)` and `device_unregister(token)` from
migration 91 (owned by the notifications module): the signed-in, active
member's own phone only, enforced in the database.

## Depends on
`shared/*`, `@/modules/notifications/client` (the bell refresh event), and the
packages `@capacitor/core`, `@capacitor/push-notifications`, `@capacitor/app`,
`@capacitor/status-bar` (imported on demand inside the app only). The Android
shell must register the `NativePrint` plugin and the `stellar_default`
notification channel.
