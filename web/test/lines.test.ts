// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import LinesView from '../src/views/LinesView.vue';
import { createStore, STORE_KEY, type Store } from '../src/state/store';
import { emptyState, fixtureState } from './fixture';

function mountWith(s = fixtureState()) {
  const store: Store = createStore({ url: 'x', wsFactory: () => ({ onopen: null, onmessage: null, onclose: null, onerror: null, close() {} }), fetch: async () => new Response('[]') });
  Object.assign(store.state, s, { conn: 'open', received: true });
  return mount(LinesView, { global: { provide: { [STORE_KEY as symbol]: store } } });
}
const names = (w: ReturnType<typeof mountWith>) => w.findAll('tbody tr').map((r) => r.find('td').text());

describe('Linie', () => {
  it('domyślnie wg wyniku rosnąco, z tagami', () => {
    const w = mountWith();
    expect(names(w)[0]).toContain('TC - Drewno,Deski');
    expect(w.text()).toContain('🚫 bez pojazdów');
    expect(w.text()).toContain('🌱 rozruch');
    expect(w.text()).toContain('🚆 KOLEJ');
  });
  it('sortowanie po wyniku odwraca kolejność', async () => {
    const w = mountWith();
    await w.find('th button[data-sort="result"]').trigger('click');
    expect(names(w)[0]).toContain('WP - Pasażerski');
    expect(w.find('th[aria-sort]').attributes('aria-sort')).toBe('descending');
  });
  it('szczegóły wybranej linii: przystanki, pojazdy, miesiące', async () => {
    const w = mountWith();
    await w.findAll('tbody tr')[0].trigger('click');
    const d = w.find('[data-test="detail"]').text();
    expect(d).toContain('Dworzec Uxbridge Południe');
    expect(d).toContain('👥');
    expect(d).toContain('36');
    expect(d).toContain('Pociąg 2');
    expect(d).toContain('w trasie');
    expect(d).toContain('100%');
    expect(d).toContain('lis 1906');
  });
  it('pusty stan', () => {
    expect(mountWith(emptyState()).text()).toContain('Czekam na dane z gry');
  });
});
