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
  // The preview used for a first-paint measure serves dist and still needs the chart.
  preview: {
    proxy,
  },
  build: {
    rolldownOptions: {
      output: {
        // CP3. The map route was shipping one file per shared module (most of them
        // under 5 KB), and the first chart frame waited on that many requests.
        // The static graph of the entry is one chunk. A lazy route keeps its own
        // modules, and modules that only that route shares stay with it.
        codeSplitting: {
          groups: [
            // One file for the whole static graph is over the 450 kB entry check, and
            // a size cap splits that graph across a cycle and the chart never mounts.
            // Vue, the map, and the engines each stay in their own file. A lazy
            // route's modules are not in this set.
            { name: 'vendor', test: /[\\/]node_modules[\\/]/, tags: ['$initial'], priority: 30 },
            { name: 'chart', test: /[\\/](map|engines)[\\/]/, tags: ['$initial'], priority: 25 },
            { name: 'index', tags: ['$initial'], priority: 20 },
            {
              name: 'route',
              priority: 0,
              entriesAware: true,
              entriesAwareMergeThreshold: 20000,
            },
          ],
        },
      },
    },
  },
})
