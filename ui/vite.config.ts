import { defineConfig, loadEnv, ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths';

// Every route the Go API serves. The SPA itself uses a hash router, so none of
// these collide with UI routes.
const API_ROUTES = ['/health', '/auth', '/login', '/logout', '/cameras'];

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
    ],
    build: {
      outDir: './dist',
    },
    server: { proxy },
    preview: { proxy },
  };
});
