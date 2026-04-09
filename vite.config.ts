import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.ico', 'icon.svg'],
      manifest: {
        name: 'Orion Escala',
        short_name: 'Orion',
        description: 'ERP de Escala para CLT Intermitente',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // Assume controle imediato — novo SW não espera abas antigas fecharem
        skipWaiting: true,
        clientsClaim: true,
        // Remove caches de deploys antigos automaticamente
        cleanupOutdatedCaches: true,
        // Não cachear o index.html — sempre busca fresco (assim bundles novos
        // sempre são descobertos). Os bundles em si continuam cacheados pelo
        // precache (hashados no nome, auto-invalidam em novo build).
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,ico,png,svg}'],
        runtimeCaching: [
          {
            // index.html nunca fica cacheado — sempre NetworkFirst
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-cache',
              expiration: { maxEntries: 1, maxAgeSeconds: 60 },
            },
          },
          {
            urlPattern: /\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
