import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig, type ProxyOptions } from 'vite'
import { geomorphDev } from './geomorph-dev.ts'
import { surfaceParityDev } from './surface-parity-dev.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const apiTarget = process.env.VOYAGE_API ?? 'http://127.0.0.1:8787'
const truthApi = process.env.VOYAGE_TRUTH_API

/** The API refuses a mutation whose Origin is not its own. Send the target's. */
function apiProxy(target: string): ProxyOptions {
  return {
    target,
    changeOrigin: true,
    configure: (proxy) => {
      proxy.on('proxyReq', (req) => {
        if (req.getHeader('origin')) req.setHeader('origin', new URL(target).origin)
      })
    },
  }
}

// Vite uses the first matching prefix. /api/truth comes before /api so a set
// VOYAGE_TRUTH_API serves the chart, and the campaign API stays on VOYAGE_API.
const proxy: Record<string, ProxyOptions> = {}
if (truthApi) proxy['/api/truth'] = apiProxy(truthApi)
proxy['/api'] = apiProxy(apiTarget)

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), surfaceParityDev(), geomorphDev()],
  server: {
    fs: { allow: [repoRoot] },
    proxy,
  },
})
