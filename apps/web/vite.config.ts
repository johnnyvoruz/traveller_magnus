import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    fs: { allow: [repoRoot] },
    proxy: {
      '/api': {
        target: process.env.VOYAGE_API ?? 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
})
