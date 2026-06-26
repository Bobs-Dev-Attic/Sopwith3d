import { defineConfig } from 'vite';

// Mobile-first WWI flight sim. Served at root so it can be wrapped in a
// Capacitor/Cordova shell or hosted as a PWA without path rewrites.
export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: false,
  },
});
