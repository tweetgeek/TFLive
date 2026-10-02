// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import VehiclesView from '../src/views/VehiclesView.vue';
import { createStore, STORE_KEY, type Store } from '../src/state/store';
import { emptyState, fixtureState } from './fixture';

function mountWith(s = fixtureState()) {
  const store: Store = createStore({ url: 'x', wsFactory: () => ({ onopen: null, onmessage: null, onclose: null, onerror: null, close() {} }), fetch: async () => new Response('[]') });
  Object.assign(store.state, s, { conn: 'open', received: true });
  return mount(VehiclesView, { global: { provide: { [STORE_KEY as symbol]: store } } });
}
const rows = (w: ReturnType<typeof mountWith>) => w.findAll('tbody tr');
const chip = (w: ReturnType<typeof mountWith>, t: string) => w.findAll('button.chip').find((b) => b.text().includes(t))!;

describe('Pojazdy', () => {
  it('wszystkie, wg wyniku malejąco, z nazwą linii i stanem', () => {
    const w = mountWith();
    expect(rows(w)).toHaveLength(3);
    expect(rows(w)[0].text()).toContain('Pociąg 2');
    expect(rows(w)[0].text()).toContain('TC - Drewno,Deski');
    expect(rows(w)[0].text()).toContain('w trasie');
    expect(rows(w)[0].text()).toContain('69%');
    expect(rows(w)[2].text()).toContain('✋ zatrzymany');
  });
  it('filtry: bez trasy, stare, bezczynne, tryb', async () => {
    const w = mountWith();
    await chip(w, 'Bez trasy').trigger('click');
    expect(rows(w).map((r) => r.text())).toEqual([expect.stringContaining('Autobus 1')]);
    await chip(w, 'Stare').trigger('click');
    expect(rows(w).map((r) => r.text())).toEqual([expect.stringContaining('Autobus 1')]);
    await chip(w, 'Bezczynne').trigger('click');
    expect(w.text()).toContain('Brak pojazdów dla tego filtra');
    await chip(w, 'KOLEJ').trigger('click');
    expect(rows(w)).toHaveLength(1);
  });
  it('filtr linii', async () => {
    const w = mountWith();
    await w.find('select').setValue('56357');
    expect(rows(w)).toHaveLength(2);
  });
  it('pusty stan', () => {
    expect(mountWith(emptyState()).text()).toContain('Czekam na dane z gry');
  });
  it('wiele pojazdów bez wyniku nie psuje sortowania (null na końcu)', () => {
    const s = fixtureState();
    s.snapshot.vehicles[1].operatingResult12m = null;
    const w = mountWith(s);
    expect(rows(w)[0].text()).toContain('Pociąg 2');
    expect(rows(w)).toHaveLength(3);
  });
});
