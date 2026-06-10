import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'esnext',
  },
  server: {
    port: 3501,
    strictPort: true,
  },
  resolve: {
    dedupe: ['three'],
  },
});
