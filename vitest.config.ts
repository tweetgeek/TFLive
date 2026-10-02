import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [vue()],
  test: {
    include: ['shared/test/**/*.test.ts', 'server/test/**/*.test.ts', 'web/test/**/*.test.ts'],
  },
});
