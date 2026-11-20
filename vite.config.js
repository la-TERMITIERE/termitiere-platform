import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'

// Identité de la version construite : lue par l'application (Paramètres, Vérifier les mises à jour) et publiée dans /version.json,
// ce qui permet de savoir si la page ouverte est la dernière version publiée.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const ID_CONSTRUCTION = String(Date.now())
const DATE_CONSTRUCTION = new Date().toISOString()
const versionJson = () => ({
  name: 'termitiere-version-json',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: ID_CONSTRUCTION, date: DATE_CONSTRUCTION, version: pkg.version }) })
  }
})

// Configuration Vite + PWA (Workbox) pour LA TERMITIÈRE
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(ID_CONSTRUCTION),
    __BUILD_DATE__: JSON.stringify(DATE_CONSTRUCTION)
  },
  plugins: [
    react(),
    versionJson(),
    VitePWA({
      // 'prompt' : on contrôle nous-mêmes l'application de la mise à jour via
      // <UpdateManager/> (polling périodique + rechargement forcé pour tous).
      registerType: 'prompt',
      // On enregistre le service worker manuellement (useRegisterSW) afin d'éviter
      // un double enregistrement avec le script auto-injecté.
      injectRegister: false,
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
