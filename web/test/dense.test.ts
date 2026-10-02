// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { Component } from 'vue';
import KpiStrip from '../src/components/KpiStrip.vue';
import MonthsChart from '../src/components/MonthsChart.vue';
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
