import { defineConfig } from 'vite';

export default defineConfig({
  base: '/Sphericalharmonics/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  },
  assetsInclude: ['**/*.glsl'],
  server: {
    port: 3000,
    open: true
  }
});
