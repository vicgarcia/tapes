import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  build: {
    outDir: '../api/dist'
  },
  server: {
    proxy: {
      '/login': {
        target: 'http://localhost:8080/',
        changeOrigin: true
      },
      '/cameras': {
        target: 'http://localhost:8080/',
        changeOrigin: true
      }
    }
  }
})
