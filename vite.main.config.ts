import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      external: ['better-sqlite3', 'bufferutil', 'utf-8-validate'],
    },
  },
});
