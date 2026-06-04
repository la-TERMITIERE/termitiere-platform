import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Configuration Vite + PWA (Workbox) pour LA TERMITIÈRE
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // Ne pas servir le fallback SPA (index.html du portail) pour l'app
        // MAXI-AGRO embarquée : elle a son propre index.html sous /apps/.
        navigateFallbackDenylist: [/^\/apps\//],
        // Handlers Web Push intégrés au service worker (notifications app fermée).
        importScripts: ['push-handler.js'],
        // Mise en cache des appels Firebase pour le mode hors-ligne
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'firebase-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 }
            }
          },
          {
            urlPattern: /^https:\/\/.*\.firebaseio\.com\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'firebase-rtdb-cache', expiration: { maxEntries: 50 } }
          }
        ]
      },
      manifest: false // on utilise public/manifest.json
    })
  ],
  server: { port: 5173, host: true }
})
