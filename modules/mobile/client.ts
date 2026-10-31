// PUBLIC client-safe exports of the mobile module: the Android app bridge's
// helpers. Every one is a no-op or the browser's own behaviour outside the app.
export { forgetThisDevice, isNativeApp, printPage } from '@/modules/mobile/internal/native';
export { backAction, isNativeAppRequest, NATIVE_APP_USER_AGENT, tapPath, type NativePlatform } from '@/modules/mobile/internal/rules';
