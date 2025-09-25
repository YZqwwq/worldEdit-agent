import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { initService } from './services/init'

// 初始化应用
async function initApp() {
  try {
    // 初始化数据库
    await initService.initialize()
    
    // 创建应用实例
    const app = createApp(App)
    
    // 使用Pinia状态管理
    app.use(createPinia())
    
    // 使用Vue Router
    app.use(router)
    
    // 挂载应用
    app.mount('#app')
    
    console.log('application initialized')
  } catch (error) {
    console.error('application initialization failed:', error)
    
    // 显示错误信息给用户
    document.body.innerHTML = `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
        font-family: Arial, sans-serif;
        color: #e74c3c;
        text-align: center;
        padding: 20px;
      ">
        <h1>应用初始化失败</h1>
        <p>数据库初始化过程中出现错误，请重启应用或联系技术支持。</p>
        <details style="margin-top: 20px; text-align: left;">
          <summary>错误详情</summary>
          <pre style="background: #f8f9fa; padding: 10px; border-radius: 4px; margin-top: 10px;">${error}</pre>
        </details>
        <button onclick="location.reload()" style="
          margin-top: 20px;
          padding: 10px 20px;
          background: #3498db;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        ">重新加载</button>
      </div>
    `
  }
}

// 启动应用
initApp()
