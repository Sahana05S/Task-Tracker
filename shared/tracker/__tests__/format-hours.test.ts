import { describe,expect,it } from 'vitest';
import { formatHours } from '@/shared/tracker/format';

// Approved 15 October 2026: hours display with two decimals everywhere; a
// non-zero value that rounds to 0.00 shows "<0.01". Display only.
describe('hours display format',()=>{
 it('shows two decimals for numbers and exact numeric strings',()=>{
  expect(formatHours(1.25)).toBe('1.25');
  expect(formatHours(8)).toBe('8.00');
  expect(formatHours('8')).toBe('8.00');
  expect(formatHours('0.08323970138888888889')).toBe('0.08');
  expect(formatHours(0)).toBe('0.00');
 });
 it('never shows a non-zero duration as 0.00',()=>{
  expect(formatHours('0.00074478333333333333')).toBe('<0.01');
  expect(formatHours(0.0007447833333333333)).toBe('<0.01');
  expect(formatHours(-0.001)).toBe('>-0.01');
  expect(formatHours(0.006)).toBe('0.01');
 });
 it('renders unset or non-numeric input as an em dash, not zero',()=>{
  expect(formatHours(null)).toBe('—');
  expect(formatHours(undefined)).toBe('—');
  expect(formatHours('')).toBe('—');
  expect(formatHours('n/a')).toBe('—');
 });
});
