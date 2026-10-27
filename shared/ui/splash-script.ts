// The post-sign-in splash ("Opening Stellar"), ported from the Catalyst tracker
// on 27 October 2026. No directive: the workspace layout (a server component)
// inlines SPLASH_SCRIPT ahead of the overlay, and splash-controls.tsx reuses the
// same keys, so the first paint and the dismissal agree.

/** Set for the tab once the splash has played; the sign-in form clears it so each sign-in opens with it. */
export const SPLASH_STORAGE_KEY = 'taskpulse:splash';

/** The query flag that forces the splash under automation, for screenshots. Written out again inside the script below. */
export const SPLASH_FORCE_QUERY = /[?&]splash=1(?:&|$)/;

/**
 * Runs in the workspace layout before the overlay: stamps `data-splash="on"`
 * on <html> when the splash should play. It never plays under automation
 * (Playwright's `navigator.webdriver`, unless `?splash=1`), under reduced
 * motion (the OS setting or the app's own switch), or a second time in the
 * same tab session. Any failure (blocked storage) means no splash.
 */
export const SPLASH_SCRIPT = `(function(){try{var e=document.documentElement;`
  + `if(navigator.webdriver&&!/[?&]splash=1(?:&|$)/.test(location.search))return;`
  + `if(e.getAttribute('data-motion')==='reduce')return;`
  + `if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;`
  + `if(sessionStorage.getItem(${JSON.stringify(SPLASH_STORAGE_KEY)}))return;`
  + `sessionStorage.setItem(${JSON.stringify(SPLASH_STORAGE_KEY)},'1');`
  + `e.setAttribute('data-splash','on')}catch(_){}})()`;
