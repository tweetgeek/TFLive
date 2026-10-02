// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import IndustryView from '../src/views/IndustryView.vue';
import TownsView from '../src/views/TownsView.vue';
import { createStore, STORE_KEY, type Store } from '../src/state/store';
import { emptyState, fixtureState } from './fixture';

function mountWith(comp: typeof IndustryView, s = fixtureState()) {
  const store: Store = createStore({ url: 'x', wsFactory: () => ({ onopen: null, onmessage: null, onclose: null, onerror: null, close() {} }), fetch: async () => new Response('[]') });
  Object.assign(store.state, s, { conn: 'open', received: true });
  return mount(comp, { global: { provide: { [STORE_KEY as symbol]: store } } });
}
const chip = (w: ReturnType<typeof mountWith>, t: string) => w.findAll('button.chip').find((b) => b.text().includes(t))!;

describe('Przemysł', () => {
  it('domyślnie Obsługiwane, z groźbą zamknięcia i tagami', () => {
    const w = mountWith(IndustryView);
    expect(w.findAll('[data-test="industry"]')).toHaveLength(2);
    expect(w.text()).not.toContain('Kopalnia nieobsługiwana');
    expect(w.text()).toContain('🚨');
    expect(w.text()).toContain('45 dni');
    expect(w.text()).toContain('📦 zalega');
    expect(w.text()).toContain('🛢️ crude oil');
    expect(w.text()).toContain('168/400');
    expect(w.text()).toContain('brak danych o dostawie');
  });
  it('filtr Wszystkie i Z alertem', async () => {
    const w = mountWith(IndustryView);
    await chip(w, 'Wszystkie').trigger('click');
    expect(w.findAll('[data-test="industry"]')).toHaveLength(3);
    await chip(w, 'Z alertem').trigger('click');
    expect(w.findAll('[data-test="industry"]')).toHaveLength(1);
  });
  it('pusty stan', () => {
    expect(mountWith(IndustryView, emptyState()).text()).toContain('Czekam na dane z gry');
  });
  it('closureTime 0 nie tworzy groźby', () => {
    const s = fixtureState();
    s.snapshot.industries[0].closureTime = 0;
    const w = mountWith(IndustryView, s);
    expect(w.text()).not.toContain('🚨');
    expect(w.text()).not.toContain('45 dni');
  });
});

describe('Miasta', () => {
  it('domyślnie Obsługiwane: szanse, spadek dostaw, ludność, emisje', () => {
    const w = mountWith(TownsView);
    expect(w.findAll('[data-test="town"]')).toHaveLength(2);
    const t = w.text();
    expect(t).toContain('💡 2 szanse');
    expect(t).toContain('📉 spadek dostaw');
    expect(t).toContain('🛍️ Handlowa · 🥬 vegetables');
    expect(t).toContain('szansa · 0/99');
    expect(t).toContain('18%');
    expect(t).toContain('64 dB');
    expect(t).toContain('Pozostałe: 1 miasto nieobsługiwane — ukryte.');
  });
  it('Pokaż wszystkie', async () => {
    const w = mountWith(TownsView);
    await w.find('button[data-test="show-all"]').trigger('click');
    expect(w.findAll('[data-test="town"]')).toHaveLength(3);
  });
  it('demand 0 nie dzieli przez zero', () => {
    const s = fixtureState();
    s.snapshot.towns[0].needs.push({ district: 'RESIDENTIAL', cargo: 'food', demand: 0, supplied: 5 });
    const w = mountWith(TownsView, s);
    const t = w.text();
    expect(t).not.toContain('Infinity');
    expect(t).not.toContain('NaN');
    expect(w.findAll('[style*="width"]').some((el) => el.attributes('style')?.includes('width: —'))).toBe(false);
  });
});
