import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { registerAppShell } from './platform/browser.ts'
import './design/tokens.css'
import './surface/preferences.ts'

registerAppShell()
createApp(App).use(router).mount('#app')
