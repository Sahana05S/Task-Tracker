/**
 * A page section that loads independently. A failed read yields an explicit
 * "unavailable" section, never a zero or an empty list pretending to be data.
 */
export type Section<T> = { status: 'ready'; data: T } | { status: 'unavailable' };

export async function settle<T>(load: () => Promise<T>): Promise<Section<T>> {
  try {
    return { status: 'ready', data: await load() };
  } catch {
    return { status: 'unavailable' };
  }
}
