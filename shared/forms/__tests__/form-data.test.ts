import { describe, expect, it } from 'vitest';
import { ISO_DATE_PATTERN, readNullableString, readString, UUID_PATTERN } from '@/shared/forms/form-data';

describe('shared form-data readers', () => {
  const form = new FormData();
  form.set('name', '  Asha  ');
  form.set('blank', '   ');
  form.set('file', new Blob(['x']));

  it('trims strings and treats missing or non-string values as empty', () => {
    expect(readString(form, 'name')).toBe('Asha');
    expect(readString(form, 'missing')).toBe('');
    expect(readString(form, 'file')).toBe('');
  });

  it('turns blank values into null', () => {
    expect(readNullableString(form, 'blank')).toBeNull();
    expect(readNullableString(form, 'name')).toBe('Asha');
  });

  it('recognises UUIDs and ISO dates', () => {
    expect(UUID_PATTERN.test('3f2b8c1e-1d2a-4c5b-9e8f-0a1b2c3d4e5f')).toBe(true);
    expect(UUID_PATTERN.test('not-a-uuid')).toBe(false);
    expect(ISO_DATE_PATTERN.test('2026-10-17')).toBe(true);
  });
});
