import './assets/main.css'

// 本地化 md-editor-v3 依赖：注入 highlight.js、katex、mermaid、echarts 的本地实例
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import mermaid from 'mermaid'
import * as echarts from 'echarts'
import { config as mdConfig } from 'md-editor-v3'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

const app = createApp(App)

// 配置 md-editor-v3 使用本地实例，避免 CDN 注入
mdConfig({
  editorExtensions: {
    highlight: { instance: hljs },
    katex: { instance: katex },
    mermaid: { instance: mermaid },
    echarts: { instance: echarts }
  }
})

app.use(router)
app.mount('#app')
