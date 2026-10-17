/** 100% = 1,000,000 integer units; remainder goes to ascending UUIDs. */
export const TOTAL_SHARE_UNITS = 1_000_000;

export function equalParticipantShares(ids: readonly string[]): Record<string, number> {
  if (!ids.length || new Set(ids).size !== ids.length) throw new Error('Select distinct participants.');
  const sorted = [...ids].sort();
  const base = Math.floor(TOTAL_SHARE_UNITS / ids.length);
  const remainder = TOTAL_SHARE_UNITS % ids.length;
  return Object.fromEntries(sorted.map((id, i) => [id, base + (i < remainder ? 1 : 0)]));
}

export function parseSharePercent(value: string): number | null {
  if (!/^\d{1,3}(\.\d{1,4})?$/.test(value)) return null;
  const [whole, fractional = ''] = value.split('.');
  const units = Number(whole) * 10_000 + Number(fractional.padEnd(4, '0'));
  return units <= TOTAL_SHARE_UNITS ? units : null;
}

export function readParticipantShares(form: FormData, ids: readonly string[]): number[] | null {
  const values = ids.map((id) => String(form.get(`sharePercent:${id}`) ?? '').trim());
  // Blank means preserve existing allocations when participants are unchanged,
  // otherwise equal shares. SQL distinguishes those cases under a row lock.
  if (values.every((value) => value === '')) return null;
  const units = values.map(parseSharePercent);
  if (units.some((unit) => unit === null) || units.reduce<number>((sum, unit) => sum + (unit ?? 0), 0) !== TOTAL_SHARE_UNITS) {
    throw new Error('Enter a share for every selected participant, totaling exactly 100%. Use at most four decimal places.');
  }
  return units as number[];
}
