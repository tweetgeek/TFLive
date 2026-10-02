// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import App from '../src/App.vue';

describe('web: szkielet', () => {
  it('montuje komponent Vue w jsdom', () => {
    expect(mount(App).text()).toContain('TFLive');
  });
});
