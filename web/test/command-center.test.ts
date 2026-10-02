// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createStore, STORE_KEY, type Store } from '../src/state/store';
import CommandCenter from '../src/views/CommandCenter.vue';
import { emptyState, fixtureState } from './fixture';

function mountCC(s = fixtureState()) {
  const store: Store = createStore({ url: 'x', wsFactory: () => ({ onopen: null, onmessage: null, onclose: null, onerror: null, close() {} }), fetch: async () => new Response('[]') });
  Object.assign(store.state, s, { conn: 'open', received: true });
  return mount(CommandCenter, { global: { provide: { [STORE_KEY as symbol]: store } } });
}

describe('Centrum dowodzenia', () => {
  it('sześć paneli z linkami do pełnych widoków i KPI', () => {
    const w = mountCC();
    const cc = w.find('[data-test="command-center"]');
    expect(cc.classes()).toEqual(expect.arrayContaining(['cc', 'dense']));
    const labels = w.findAll('section.panel').map((p) => p.attributes('aria-label'));
    expect(labels).toEqual(['🔔 Alerty', '🛤️ Linie', '🚆 Pojazdy', '📊 Wynik operacyjny', '🏭 Przemysł', '🏙️ Miasta']);
    expect(w.findAll('a.full').map((a) => a.attributes('href'))).toEqual(['#/alerty', '#/linie', '#/pojazdy', '#/przemysl', '#/miasta']);
    expect(w.find('.kpis.compact').exists()).toBe(true);
  });
  it('dane wszystkich obszarów naraz', () => {
    const t = mountCC().text();
    for (const s of ['Pojazd bez trasy: Autobus 1', 'TC - Drewno,Deski', 'Autobus 2', 'lis 1906', 'Eccles Poręba', 'Uxbridge']) expect(t).toContain(s);
  });
  it('liczniki w nagłówkach paneli', () => {
    const counts = mountCC().findAll('section.panel .cnt').map((c) => c.text());
    expect(counts).toEqual(['5', '3', '3', '2', '2']);
  });
  it('pusty stan: jeden komunikat', () => {
    const w = mountCC(emptyState());
    expect(w.findAll('section.panel')).toHaveLength(0);
    expect(w.text().match(/Czekam na dane z gry/g)).toHaveLength(1);
  });
});
