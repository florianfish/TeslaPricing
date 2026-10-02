import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

// Version de l'add-on Home Assistant : l'image publiée est construite depuis ce même fichier
const addonVersion =
  fs.readFileSync(path.join(import.meta.dirname, 'tesla-pricing', 'config.yaml'), 'utf-8')
    .match(/^version:\s*"?([^"\s]+)"?/m)?.[1] ?? 'dev';

export default defineConfig(() => {
  return {
    define: {
      __APP_VERSION__: JSON.stringify(addonVersion),
    },
    // Chemins relatifs : requis pour être servi sous un préfixe (Ingress Home Assistant)
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
