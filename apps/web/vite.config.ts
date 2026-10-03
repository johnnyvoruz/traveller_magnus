import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VOYAGE_API ?? 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
})
