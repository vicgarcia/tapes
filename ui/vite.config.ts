import { defineConfig, loadEnv, ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths';
import { VitePWA } from 'vite-plugin-pwa'

// Every route the Go API serves. The SPA itself uses a hash router, so none of
// these collide with UI routes.
const API_ROUTES = ['/health', '/auth', '/login', '/logout', '/cameras'];

// Navigations to API routes must reach the server, never the SPA shell.
const API_ROUTE_PATTERN = /^\/(health|auth|login|logout|cameras)(\/|\?|$)/;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // TAPES_API_URL picks the API the dev/preview server proxies to,
  // e.g. TAPES_API_URL=http://127.0.0.1:8672 npm run dev
  const env = loadEnv(mode, '.', '');
  const target = env.TAPES_API_URL || 'http://localhost:8671';
  const proxy: Record<string, ProxyOptions> = Object.fromEntries(
    API_ROUTES.map(route => [route, { target, changeOrigin: true }])
  );

  return {
    plugins: [
      react(),
      tsconfigPaths(),
      VitePWA({
        // 'prompt' rather than 'autoUpdate': an automatic reload would kill a
        // video someone is watching, so the user picks the moment.
        registerType: 'prompt',
        includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png', 'icon.svg'],
        manifest: {
          name: 'Tapes',
          short_name: 'Tapes',
          description: 'Home security camera viewer',
          theme_color: '#0a0a0a',
          background_color: '#0a0a0a',
          display: 'standalone',
          orientation: 'any',
          start_url: '/',
          scope: '/',
          icons: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          ],
        },
        workbox: {
          // Only the app shell is precached. There is deliberately no runtime
          // caching: API, snapshot, HLS and MP4 requests are never handled by
          // the service worker, so Range requests and auth go straight to the
          // network.
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [API_ROUTE_PATTERN],
          runtimeCaching: [],
          cleanupOutdatedCaches: true,
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    build: {
      outDir: './dist',
    },
    server: { proxy },
    preview: { proxy },
  };
});
