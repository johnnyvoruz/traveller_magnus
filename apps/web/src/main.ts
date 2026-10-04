import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import './design/tokens.css'
import './surface/preferences.ts'

createApp(App).use(router).mount('#app')
