// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import App from '../src/App.vue';
import { createStore, STORE_KEY, type Store } from '../src/state/store';
import { route, viewFromHash } from '../src/state/route';
import { emptyState, fixtureState } from './fixture';

function storeWith(s: ReturnType<typeof fixtureState>, conn: 'open' | 'closed' = 'open'): Store {
  const store = createStore({ url: 'ws://x/ws', wsFactory: () => ({ onopen: null, onmessage: null, onclose: null, onerror: null, close() {} }), fetch: async () => new Response('[]') });
  Object.assign(store.state, s, { conn, received: true });
  return store;
}
const mountApp = (store: Store) => mount(App, { global: { provide: { [STORE_KEY as symbol]: store } } });

describe('szkielet', () => {
  it('viewFromHash', () => {
    expect(viewFromHash('#/linie')).toBe('linie');
    expect(viewFromHash('')).toBe('przeglad');
    expect(viewFromHash('#/xyz')).toBe('przeglad');
  });

  it('zakładki z emoji, licznik niewyciszonych alertów, pigułki stanu', () => {
    const w = mountApp(storeWith(fixtureState()));
    const tabs = w.findAll('nav a');
    expect(tabs.map((t) => t.attributes('href'))).toEqual(['#/przeglad', '#/alerty', '#/linie', '#/pojazdy', '#/przemysl', '#/miasta']);
    expect(tabs[1].text()).toContain('🔔');
    expect(tabs[1].text()).toContain('5');
    expect(w.text()).toContain('26 sty 1907');
    expect(w.text()).toContain('1,0 MB/h');
    expect(w.text()).toContain('na żywo');
  });

  it('baner: brak połączenia z serwerem', () => {
    const w = mountApp(storeWith(fixtureState(), 'closed'));
    expect(w.find('[role="status"]').text()).toContain('Brak połączenia z serwerem');
  });

  it('baner: brak logu gry', () => {
    const w = mountApp(storeWith(emptyState()));
    expect(w.find('[role="status"]').text()).toContain('Nie znaleziono logu gry');
  });

  it('baner: pauza i brak świeżych danych', () => {
    const paused = fixtureState();
    paused.status = { ...paused.status, live: false, paused: true };
    expect(mountApp(storeWith(paused)).find('[role="status"]').text()).toContain('Pauza');
    const stale = fixtureState();
    stale.status = { ...stale.status, live: false, paused: false };
    expect(mountApp(storeWith(stale)).find('[role="status"]').text()).toContain('Brak nowych danych z gry');
  });

  it('brak banera, gdy wszystko działa; aktywny widok wg route', async () => {
    const w = mountApp(storeWith(fixtureState()));
    expect(w.find('[role="status"]').exists()).toBe(false);
    route.view = 'linie';
    await w.vm.$nextTick();
    expect(w.find('nav a[aria-current="page"]').attributes('href')).toBe('#/linie');
    route.view = 'przeglad';
  });
});
