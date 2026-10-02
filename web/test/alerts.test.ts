// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import AlertsView from '../src/views/AlertsView.vue';
import { createStore, STORE_KEY, type Store } from '../src/state/store';
import { fixtureState } from './fixture';

function mountWith() {
  const store: Store = createStore({ url: 'x', wsFactory: () => ({ onopen: null, onmessage: null, onclose: null, onerror: null, close() {} }), fetch: async () => new Response('[]') });
  Object.assign(store.state, fixtureState(), { conn: 'open', received: true });
  store.mute = vi.fn(async () => {});
  store.unmute = vi.fn(async () => {});
  return { store, w: mount(AlertsView, { global: { provide: { [STORE_KEY as symbol]: store } } }) };
}

describe('Alerty', () => {
  it('domyślnie wszystkie niewyciszone, z datą „od"', () => {
    const { w } = mountWith();
    expect(w.findAll('[data-test="alert"]')).toHaveLength(5);
    expect(w.text()).toContain('od 28 paź 1906');
  });
  it('filtr kategorii', async () => {
    const { w } = mountWith();
    await w.findAll('button.chip').find((b) => b.text().includes('Linie'))!.trigger('click');
    expect(w.findAll('[data-test="alert"]')).toHaveLength(2);
    expect(w.findAll('button.chip').find((b) => b.text().includes('Linie'))!.attributes('aria-pressed')).toBe('true');
  });
  it('Odłóż i Ignoruj wołają magazyn', async () => {
    const { w, store } = mountWith();
    const first = w.findAll('[data-test="alert"]')[0];
    await first.findAll('button').find((b) => b.text().includes('Odłóż'))!.trigger('click');
    await flushPromises();
    await first.findAll('button').find((b) => b.text().includes('Ignoruj'))!.trigger('click');
    await flushPromises();
    expect(store.mute).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: store.state.alerts[0].id }), 'snooze');
    expect(store.mute).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: store.state.alerts[0].id }), 'ignore');
  });
  it('Pokaż wyciszone → wyciszony z opisem i Przywróć', async () => {
    const { w, store } = mountWith();
    await w.find('input[type="checkbox"]').setValue(true);
    const muted = w.findAll('[data-test="alert"]').find((x) => x.text().includes('Niskie obłożenie'))!;
    expect(muted.text()).toContain('odłożony do');
    expect(muted.text()).toContain('🔕 wyciszony');
    expect(muted.classes()).toContain('muted');
    await muted.findAll('button').find((b) => b.text().includes('Przywróć'))!.trigger('click');
    expect(store.unmute).toHaveBeenCalledWith(expect.objectContaining({ type: 'low-line-load' }));
  });
  it('actionError wyświetla komunikat błędu', async () => {
    const { store, w } = mountWith();
    store.state.actionError = 'Nie udało się zapisać wyciszenia (HTTP 409)';
    await w.vm.$nextTick();
    const alert = w.find('[role="alert"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toContain('HTTP 409');
  });
  it('actionError null — brak alertu o błędzie', () => {
    const { w } = mountWith();
    expect(w.find('[role="alert"]').exists()).toBe(false);
  });
  it('filtr ważności łączy się z kategorią (AND)', async () => {
    const { w } = mountWith();
    const sev = (t: string) => w.findAll('button.chip').find((b) => b.text() === t)!;
    expect(sev('Każda ważność').attributes('aria-pressed')).toBe('true');
    await sev('krytyczny').trigger('click');
    const rows = w.findAll('[data-test="alert"]');
    expect(rows).toHaveLength(1);
    expect(rows[0].text()).toContain('Pojazd bez trasy: Autobus 1');
    expect(sev('krytyczny').attributes('aria-pressed')).toBe('true');
    await w.findAll('button.chip').find((b) => b.text().includes('Linie'))!.trigger('click');
    expect(w.findAll('[data-test="alert"]')).toHaveLength(0);
    await sev('Każda ważność').trigger('click');
    expect(w.findAll('[data-test="alert"]')).toHaveLength(2);
  });
});
