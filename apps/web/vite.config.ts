import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { geomorphDev } from './geomorph-dev.ts'
import { surfaceParityDev } from './surface-parity-dev.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const apiTarget = process.env.VOYAGE_API ?? 'http://127.0.0.1:8787'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), surfaceParityDev(), geomorphDev()],
  server: {
    fs: { allow: [repoRoot] },
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        // The API refuses a mutation whose Origin is not its own. Through this proxy the browser
        // sends the dev server's origin, so a local save would be 403; send the API's instead.
        configure: (proxy) => {
          proxy.on('proxyReq', (req) => {
            if (req.getHeader('origin')) req.setHeader('origin', new URL(apiTarget).origin)
          })
        },
      },
    },
  },
})
