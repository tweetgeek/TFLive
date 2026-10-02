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
  it('brak rezerwy: bez jednostki „mies."', () => {
    const s = fixtureState();
    s.snapshot.finance!.runningCosts12m = 0;
    const w = mountWith(s);
    const card = w.findAll('.card').find((c) => c.text().includes('Rezerwa'))!;
    expect(card.text()).toContain('—');
    expect(card.text()).not.toContain('mies.');
  });
  it('najlepszy pojazd: klasa wg znaku', () => {
    const s = fixtureState();
    expect(mountWith(s).find('.facts .num.pos').exists()).toBe(true);
    s.snapshot.vehicles.forEach((v) => { v.operatingResult12m = v.id === 51559 ? -5 : null; });
    const w = mountWith(s);
    const v = w.findAll('.facts .num').find((e) => e.text() === '−5')!;
    expect(v.classes()).toContain('neg');
    s.snapshot.vehicles[0].operatingResult12m = 0;
    const z = mountWith(s).findAll('.facts .num').find((e) => e.text() === '0')!;
    expect(z.classes()).toContain('muted');
  });
});
