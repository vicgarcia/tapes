import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Tapes Security Cameras',
        short_name: 'Tapes',
        description: 'Security camera recording management system',
        theme_color: '#212529',
        background_color: '#212529',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'icon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: 'icon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        // Cache only static assets (JS/CSS/HTML)
        globPatterns: ['**/*.{js,css,html}'],
        // Don't cache API calls, videos, or thumbnails
        navigateFallback: null,
        runtimeCaching: []
      }
    })
  ],
  build: {
    outDir: '../api/dist'
  },
  server: {
    proxy: {
      '/login': {
        target: 'http://localhost:8633/',
        changeOrigin: true
      },
      '/cameras': {
        target: 'http://localhost:8633/',
        changeOrigin: true
      }
    }
  }
})
