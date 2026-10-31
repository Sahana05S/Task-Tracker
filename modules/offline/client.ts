// PUBLIC client-safe exports of the offline module (M21): the Android app's
// offline copy and its switch. Nothing here calls the server.
export {
  asOfLabel,
  childRows,
  correctedNow,
  OFFLINE_SECTIONS,
  snapshotIsDue,
  storeSnapshot,
  type OfflineCheckIn,
  type OfflineMission,
  type OfflineRow,
  type OfflineSection,
  type OfflineSnapshot,
  type OfflineTimer,
  type StoredSnapshot,
} from '@/modules/offline/internal/rules';
export { clearOfflineData, readOfflineMode, readSnapshot, requestPersistentStorage, saveSnapshot, writeOfflineMode } from '@/modules/offline/internal/store';
export { forgetOfflineData, registerOfflineWorker, unregisterOfflineWorker } from '@/modules/offline/internal/worker-client';
