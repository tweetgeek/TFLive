// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { Component } from 'vue';
import KpiStrip from '../src/components/KpiStrip.vue';
import MonthsChart from '../src/components/MonthsChart.vue';
import AlertsView from '../src/views/AlertsView.vue';
import IndustryView from '../src/views/IndustryView.vue';
import TownsView from '../src/views/TownsView.vue';
import LinesView from '../src/views/LinesView.vue';
import VehiclesView from '../src/views/VehiclesView.vue';
import { createStore, STORE_KEY, type Store } from '../src/state/store';
import { fixtureState } from './fixture';

export function mountDense(comp: Component, props: Record<string, unknown> = { dense: true }, s = fixtureState()) {
  const store: Store = createStore({ url: 'x', wsFactory: () => ({ onopen: null, onmessage: null, onclose: null, onerror: null, close() {} }), fetch: async () => new Response('[]') });
  Object.assign(store.state, s, { conn: 'open', received: true });
  store.mute = vi.fn(async () => {});
  store.unmute = vi.fn(async () => {});
  return { store, w: mount(comp, { props, global: { provide: { [STORE_KEY as symbol]: store } } }) };
}
const nb = (s: string) => s.replace(/\s/g, ' ');

describe('KpiStrip i MonthsChart', () => {
  it('KpiStrip compact: 6 wartości w jednym wierszu', () => {
    const { w } = mountDense(KpiStrip, { compact: true });
    expect(w.find('section').classes()).toContain('compact');
    expect(w.findAll('.card')).toHaveLength(6);
    expect(nb(w.text())).toContain('2 263 578');
    expect(nb(w.text())).toContain('8,4');
  });
  it('MonthsChart compact: słupki, koszty i najlepszy pojazd', () => {
    const { w } = mountDense(MonthsChart, { compact: true });
    expect(w.find('.mchart').classes()).toContain('compact');
    expect(nb(w.text())).toContain('lis 1906');
    expect(nb(w.text())).toContain('3 218 127');
    expect(w.text()).toContain('Pociąg 2');
  });
});

describe('Alerty dense', () => {
  it('bez chipsów ważności i przełącznika wyciszonych, przyciski z etykietą dostępności', async () => {
    const { w, store } = mountDense(AlertsView);
    expect(w.find('.view').classes()).toContain('dense');
    expect(w.text()).not.toContain('Każda ważność');
    expect(w.find('input[type="checkbox"]').exists()).toBe(false);
    const snooze = w.find('[data-test="alert"] button[aria-label="Odłóż 3 mies."]');
    expect(snooze.text()).toBe('⏰');
    await snooze.trigger('click');
    expect(store.mute).toHaveBeenCalledWith(expect.objectContaining({ id: store.state.alerts[0].id }), 'snooze');
  });
  it('bez dense: przyciski z pełnym tekstem jak dotąd', () => {
    const { w } = mountDense(AlertsView, {});
    expect(w.find('.view').classes()).not.toContain('dense');
    expect(w.find('[data-test="alert"] button[aria-label="Odłóż 3 mies."]').text()).toBe('⏰ Odłóż 3 mies.');
  });
});

describe('Pojazdy dense', () => {
  it('wszystkie pojazdy, bez nazwy modelu', () => {
    const { w } = mountDense(VehiclesView);
    expect(w.find('.view').classes()).toContain('dense');
    expect(w.findAll('tbody tr')).toHaveLength(3);
    expect(w.text()).not.toContain('mogul_2_6_0');
  });
});

describe('Linie dense', () => {
  it('bez panelu bocznego, z mini-wykresem; wiersz rozwija i zwija szczegóły', async () => {
    const { w } = mountDense(LinesView);
    expect(w.find('[data-test="detail"]').exists()).toBe(false);
    expect(w.findAll('[data-test="spark"]')).toHaveLength(3);
    expect(w.find('[data-test="expand"]').exists()).toBe(false);
    const row = w.findAll('tbody tr').find((r) => r.text().includes('TC - Drewno,Deski'))!;
    await row.trigger('click');
    const exp = w.find('[data-test="expand"]');
    expect(exp.text()).toContain('Dworzec Uxbridge Południe');
    expect(exp.text()).toContain('Pociąg 2');
    expect(row.attributes('aria-expanded')).toBe('true');
    await row.trigger('click');
    expect(w.find('[data-test="expand"]').exists()).toBe(false);
  });
  it('Enter rozwija szczegóły', async () => {
    const { w } = mountDense(LinesView);
    const row = w.findAll('tbody tr').find((r) => r.text().includes('Bus - Pasażerski - Eccles LO'))!;
    await row.trigger('keydown.enter');
    expect(w.find('[data-test="expand"]').text()).toContain('Kings Road');
  });
});

describe('Przemysł i Miasta dense', () => {
  it('Przemysł: wiersze zamiast kart, groźba zamknięcia, produkcja z %', () => {
    const { w } = mountDense(IndustryView);
    expect(w.find('.view').classes()).toContain('dense');
    expect(w.find('.card').exists()).toBe(false);
    expect(w.findAll('[data-test="industry"]')).toHaveLength(2);
    expect(w.text()).toContain('45 dni');
    expect(w.text()).toContain('42%');
    expect(w.text()).toContain('📦 zalega');
  });
  it('Miasta: wiersze z potrzebami i szansami', () => {
    const { w } = mountDense(TownsView);
    expect(w.find('.card').exists()).toBe(false);
    const rows = w.findAll('[data-test="town"]');
    expect(rows).toHaveLength(2);
    const t = w.text().replace(/\s/g, ' ');
    expect(t).toContain('💡 2');
    expect(t).toContain('0/99');
    expect(t).toContain('18%');
  });
});
