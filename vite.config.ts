import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { version } from './package.json';

export default defineConfig({
  // relative asset paths so the production build works when Electron loads it via file://
  base: './',
  plugins: [react()],
  server: { port: 5173 },
  // the running version, for the update banner's "you have vX" check
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(version) },
});
