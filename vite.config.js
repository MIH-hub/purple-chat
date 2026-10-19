import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  envDir: resolve(__dirname),
  define: {
    global: 'globalThis'
  },
  server: {
    port: 3000,
    open: true,
    host: true
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/ui/index.html')
      }
    }
  },
  root: resolve(__dirname, 'src/ui'),
  publicDir: resolve(__dirname, 'src/ui/public')
});