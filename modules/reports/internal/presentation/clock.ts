import { observationInstant } from '@/shared/time/observation-clock';
import { viewContext, type ViewContext } from './context';

export { observationInstant, type ObservationInstant } from '@/shared/time/observation-clock';

/** viewContext anchored on the observation instant; no extra lag on a database instant. */
export async function liveViewContext(periodValue?: string, asOfValue?: string): Promise<ViewContext> {
  const { instant, source } = await observationInstant();
  return source === 'database' ? viewContext(periodValue, asOfValue, instant, 0) : viewContext(periodValue, asOfValue);
}
