import { describe, expect, it } from 'vitest';
import { monthIndex, monthMs, yearMs } from '@tflive/shared';

describe('time', () => {
  it('monthIndex liczy miesiące od roku 0', () => {
    expect(monthIndex({ y: 1900, m: 1, d: 1 })).toBe(1900 * 12);
    expect(monthIndex({ y: 1906, m: 12, d: 2 })).toBe(1906 * 12 + 11);
  });
  it('miesiąc = 30 dni, rok = 365 dni', () => {
    expect(monthMs(4000)).toBe(120000);
    expect(yearMs(4000)).toBe(1460000);
  });
});
