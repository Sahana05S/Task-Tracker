/** Small, shared readers for FormData submitted to server actions. */

/** The trimmed string value of `key`, or '' when missing or not a string. */
export function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

/** Like readString, but '' becomes null. */
export function readNullableString(formData: FormData, key: string): string | null {
  const value = readString(formData, key);
  return value === '' ? null : value;
}

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
