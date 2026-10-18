import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig, type ProxyOptions } from 'vite'
import { geomorphDev } from './geomorph-dev.ts'
import { surfaceParityDev } from './surface-parity-dev.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const apiTarget = process.env.VOYAGE_API ?? 'http://127.0.0.1:8787'
const truthApi = process.env.VOYAGE_TRUTH_API
// npm run dev sets this so the page's Origin and Host reach the Worker. A passkey's origin is the page.
const keepPageOrigin = process.env.VOYAGE_KEEP_ORIGIN === '1'

/** The API refuses a mutation whose Origin is not its own. Send the target's, unless the page origin is the one the Worker expects. The chart proxy always uses the chart host. */
function apiProxy(target: string, keep: boolean): ProxyOptions {
  return {
    target,
    changeOrigin: !keep,
    ws: true,
    xfwd: true,
    configure: (proxy) => {
      if (keep) return
      const sendTargetOrigin = (req: { getHeader: (name: string) => unknown; setHeader: (name: string, value: string) => void }) => {
        if (req.getHeader('origin')) req.setHeader('origin', new URL(target).origin)
      }
      proxy.on('proxyReq', sendTargetOrigin)
      proxy.on('proxyReqWs', sendTargetOrigin)
    },
  }
}

// Vite uses the first matching prefix. /api/truth comes before /api so a set
// VOYAGE_TRUTH_API serves the chart, and the campaign API stays on VOYAGE_API.
const proxy: Record<string, ProxyOptions> = {}
if (truthApi) proxy['/api/truth'] = apiProxy(truthApi, false)
proxy['/api'] = apiProxy(apiTarget, keepPageOrigin)

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), surfaceParityDev(), geomorphDev()],
  server: {
    fs: { allow: [repoRoot] },
    proxy,
  },
})
