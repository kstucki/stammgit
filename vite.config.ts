import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  // public/ holds source documents as well as the existing Netlify publish target.
  // Never let Vite empty it or copy the generated entry back into its own input.
  publicDir: false,
  // server.mjs owns HTML/auth/static responses, including real asset 404s.
  appType: 'custom',
  server: {
    watch: {
      // Local sync rebuilds these files. Reloading for public/index.html would
      // interrupt the client's YAML -> queued deletion transaction.
      ignored: ['**/public/index.html', '**/public/data/**', '**/public/assets/ui/**', '**/dist/**'],
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets/ui',
    target: ['es2022', 'safari16.4'],
  },
});
