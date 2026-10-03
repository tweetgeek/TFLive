// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../src/App.vue';
import { layout, startLayout, WIDE_QUERY } from '../src/state/layout';
import { route } from '../src/state/route';
import { createStore, STORE_KEY, type Store } from '../src/state/store';
import { fixtureState } from './fixture';

function fakeMatchMedia(initial: boolean) {
  let listener: ((e: { matches: boolean }) => void) | null = null;
  const queries: string[] = [];
  const mm = (q: string) => {
    queries.push(q);
    return { matches: initial, addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => { listener = fn; } } as unknown as MediaQueryList;
  };
  return { mm, queries, fire: (m: boolean) => listener?.({ matches: m }) };
}
function storeWith(): Store {
  const store = createStore({ url: 'x', wsFactory: () => ({ onopen: null, onmessage: null, onclose: null, onerror: null, close() {} }), fetch: async () => new Response('[]') });
  Object.assign(store.state, fixtureState(), { conn: 'open', received: true });
  return store;
}
const mountApp = () => mount(App, { global: { provide: { [STORE_KEY as symbol]: storeWith() } } });

describe('układ', () => {
  afterEach(() => { layout.wide = false; route.view = 'przeglad'; });

  it('startLayout czyta zapytanie i reaguje na zmianę rozmiaru', () => {
    const f = fakeMatchMedia(true);
    startLayout({ matchMedia: f.mm });
    expect(f.queries).toEqual([WIDE_QUERY]);
    expect(layout.wide).toBe(true);
    f.fire(false);
    expect(layout.wide).toBe(false);
  });

  it('próg dużego ekranu obejmuje MacBooki z Retiną (≥1400×720)', () => {
    expect(WIDE_QUERY).toBe('(min-width: 1400px) and (min-height: 720px)');
  });

  it('startLayout bez matchMedia zostawia wąski układ', () => {
    startLayout({});
    expect(layout.wide).toBe(false);
  });

  it('duży ekran + #/przeglad → centrum dowodzenia; inne widoki → zakładka', async () => {
    layout.wide = true;
    const w = mountApp();
    expect(w.find('[data-test="command-center"]').exists()).toBe(true);
    expect(w.find('.app').classes()).toContain('app-cc');
    route.view = 'linie';
    await w.vm.$nextTick();
    expect(w.find('[data-test="command-center"]').exists()).toBe(false);
  });

  it('wąski ekran → zwykły Przegląd', () => {
    const w = mountApp();
    expect(w.find('[data-test="command-center"]').exists()).toBe(false);
    expect(w.text()).toContain('Najważniejsze alerty');
  });
});
