import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * En producción el SPA y la API comparten dominio (CloudFront enruta /api/* a API Gateway),
 * así que la URL base es relativa. En desarrollo, Vite hace de proxy hacia el backend local.
 */
export default defineConfig({
  plugins: [react()],
  define: {
    __API_BASE_URL__: JSON.stringify(process.env.VITE_API_BASE_URL ?? '/api/v1'),
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        // Librerías en un chunk aparte: cambian poco y se cachean entre despliegues
        manualChunks: { vendor: ['react', 'react-dom', 'react-dom/client', 'react-router-dom', '@reduxjs/toolkit', 'react-redux'] },
      },
    },
  },
});
