import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo, /api (salas y hora) va al servidor local de Cloudflare: `npm run servidor`.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', ws: true },
    },
  },
});
