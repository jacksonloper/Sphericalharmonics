import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        shflow: resolve(__dirname, 'shflow.html'),
        earth: resolve(__dirname, 'earth.html')
      },
      output: {
        manualChunks: undefined
      }
    },
    copyPublicDir: true
  },
  assetsInclude: ['**/*.glsl'],
  publicDir: 'public',
  server: {
    port: 3000,
    open: true
  }
});
