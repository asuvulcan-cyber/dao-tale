/// <reference types="vitest/config" />

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Em desenvolvimento o Vite roda em porta própria e repassa /api ao servidor local.
// Em produção o próprio servidor serve o bundle de web/dist.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/teste/setup.ts',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': `http://127.0.0.1:${process.env.DAO_TALE_PORTA ?? 8317}`,
    },
  },
});
