import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * CSP como <meta> en el build de producción. En AWS la CSP la pone CloudFront como cabecera;
 * en hostings estáticos sin cabeceras propias (DigitalOcean App Platform) esta etiqueta la sustituye.
 * La URL de la pasarela llega por variable de entorno al compilar: nunca se escribe en el repo.
 */
const contentSecurityPolicy = (): Plugin => ({
  name: 'content-security-policy',
  apply: 'build',
  transformIndexHtml(html) {
    const gatewayUrl = process.env.PAYMENT_GATEWAY_BASE_URL;
    if (!gatewayUrl) return html;
    const policy = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      `connect-src 'self' ${new URL(gatewayUrl).origin}`,
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      'upgrade-insecure-requests',
    ].join('; ');
    return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`);
  },
});

/**
 * En producción el SPA y la API comparten dominio (el CDN o el router del hosting envía /api/* al backend),
 * así que la URL base es relativa. En desarrollo, Vite hace de proxy hacia el backend local.
 */
export default defineConfig({
  plugins: [react(), contentSecurityPolicy()],
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
