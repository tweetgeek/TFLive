import { describe, expect, it } from 'vitest';
import { fmtDecimal, fmtGameDate, fmtInt, fmtMBh, fmtMonthIndex, fmtPct, fmtSigned } from '../src/lib/format';

const nb = (s: string) => s.replace(/\s/g, ' ');

describe('format', () => {
  it('liczby całkowite z separatorem tysięcy i „—" dla braku', () => {
    expect(nb(fmtInt(2263578))).toBe('2 263 578');
    expect(fmtInt(null)).toBe('—');
    expect(fmtInt(Number.NaN)).toBe('—');
  });
  it('kwoty ze znakiem (minus typograficzny)', () => {
    expect(nb(fmtSigned(488573))).toBe('+488 573');
    expect(nb(fmtSigned(-111174))).toBe('−111 174');
    expect(fmtSigned(0)).toBe('0');
    expect(fmtSigned(undefined)).toBe('—');
  });
  it('procenty i ułamki dziesiętne po polsku', () => {
    expect(fmtPct(0.4237)).toBe('42%');
    expect(fmtPct(null)).toBe('—');
    expect(fmtDecimal(8.44)).toBe('8,4');
    expect(fmtDecimal(null)).toBe('—');
  });
  it('daty gry i miesiące', () => {
    expect(fmtGameDate({ y: 1907, m: 1, d: 26 })).toBe('26 sty 1907');
    expect(fmtGameDate(null)).toBe('—');
    expect(fmtMonthIndex(1906 * 12 + 10)).toBe('lis 1906');
  });
  it('MB/h', () => {
    expect(fmtMBh(1.02)).toBe('1,0 MB/h');
    expect(fmtMBh(null)).toBe('— MB/h');
  });
});
