import { describe, expect, it } from 'vitest';
import { alertEmoji, CATEGORY, cargoEmoji, DISTRICT, industryEmoji, modeEmoji, modeLabel, VEHICLE_STATE } from '../src/lib/emoji';

describe('emoji i etykiety', () => {
  it('tryby transportu', () => {
    expect(modeEmoji('RAIL')).toBe('🚆');
    expect(modeLabel('WATER')).toBe('WODA');
    expect(modeEmoji('XYZ')).toBe('🚗');
  });
  it('kategorie i typy alertów', () => {
    expect(CATEGORY.supply).toEqual({ emoji: '🏭', label: 'Dostawy' });
    expect(alertEmoji('closure-threat')).toBe('🚨');
  });
  it('stany pojazdów i dzielnice', () => {
    expect(VEHICLE_STATE.IN_DEPOT.label).toBe('w zajezdni');
    expect(DISTRICT.COMMERCIAL).toEqual({ emoji: '🛍️', label: 'Handlowa' });
  });
  it('towary i fabryki z domyślnymi', () => {
    expect(cargoEmoji('fish')).toBe('🐟');
    expect(cargoEmoji('nieznany_towar')).toBe('📦');
    expect(industryEmoji('oil_platform')).toBe('🛢️');
    expect(industryEmoji('forest')).toBe('🪓');
    expect(industryEmoji('cos_innego')).toBe('🏭');
  });
});
