// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import OverviewView from '../src/views/OverviewView.vue';
import { createStore, STORE_KEY, type Store } from '../src/state/store';
import { emptyState, fixtureState } from './fixture';

function mountWith(s: ReturnType<typeof fixtureState>) {
  const store: Store = createStore({ url: 'x', wsFactory: () => ({ onopen: null, onmessage: null, onclose: null, onerror: null, close() {} }), fetch: async () => new Response('[]') });
  Object.assign(store.state, s, { conn: 'open', received: true });
  return mount(OverviewView, { global: { provide: { [STORE_KEY as symbol]: store } } });
}
const nb = (s: string) => s.replace(/\s/g, ' ');

describe('Przegląd', () => {
  it('kafelki KPI', () => {
    const t = nb(mountWith(fixtureState()).text());
    expect(t).toContain('2 263 578');
    expect(t).toContain('14 908 337');
    expect(t).toContain('+2 715 326');
    expect(t).toContain('8,4');
    expect(t).toContain('3 · 3');
    expect(t).toContain('806');
    expect(t).toContain('MnicH Transport');
  });
  it('najważniejsze alerty: tylko niewyciszone, najwyżej 5, link do wszystkich', () => {
    const w = mountWith(fixtureState());
    const items = w.findAll('[data-test="top-alert"]');
    expect(items).toHaveLength(5);
    expect(w.text()).not.toContain('Niskie obłożenie');
    expect(w.find('a[href="#/alerty"]').text()).toContain('5');
  });
  it('wykres miesięcy z podpisami i znakiem', () => {
    const t = nb(mountWith(fixtureState()).text());
    expect(t).toContain('lis 1906');
    expect(t).toContain('−111 174');
    expect(t).toContain('+488 573');
    expect(t).toContain('Pociąg 2');
  });
  it('pusty stan', () => {
    expect(mountWith(emptyState()).text()).toContain('Czekam na dane z gry');
  });
});
