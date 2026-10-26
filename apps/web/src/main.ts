import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { registerAppShell } from './platform/browser.ts'
import { loadSchemas } from './platform/schemas.ts'
import './design/tokens.css'
import './surface/preferences.ts'

registerAppShell()
createApp(App).use(router).mount('#app')
// The schema library comes down after the first paint, not in it (ZP2). A store that needs it awaits the same load.
loadSchemas().catch(() => undefined)
