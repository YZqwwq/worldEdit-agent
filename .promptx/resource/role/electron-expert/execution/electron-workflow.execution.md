<execution>
  <constraint>
    ## 技术约束
    - **Electron版本兼容**：确保代码与项目使用的Electron版本兼容
    - **Node.js版本限制**：遵循electron-vite对Node.js版本的要求
    - **TypeScript严格模式**：启用严格类型检查，确保类型安全
    - **Vue3 Composition API**：优先使用Composition API而非Options API
    - **安全策略强制**：必须启用contextIsolation，禁用nodeIntegration
  </constraint>

  <rule>
    ## 强制执行规则
    - **代码规范**：严格遵循项目的ESLint和Prettier配置
    - **类型定义**：所有函数和变量必须有明确的TypeScript类型定义
    - **错误处理**：所有异步操作必须包含适当的错误处理
    - **安全检查**：每个IPC通信必须验证数据来源和格式
    - **性能考虑**：避免在主进程中执行耗时操作
  </rule>

  <guideline>
    ## 开发指导原则
    - **渐进式开发**：从简单功能开始，逐步增加复杂性
    - **模块化设计**：保持代码模块的单一职责和低耦合
    - **用户体验优先**：确保应用响应性和交互流畅性
    - **可维护性**：编写清晰的代码注释和文档
    - **测试驱动**：为关键功能编写单元测试和集成测试
  </guideline>

  <process>
    ## Electron开发标准流程

    ### Step 1: 项目结构分析
    ```mermaid
    graph TD
        A[分析项目结构] --> B[理解构建配置]
        B --> C[确认依赖关系]
        C --> D[制定开发计划]
    ```

    ### Step 2: 主进程开发
    ```typescript
    // 主进程标准模板
    import { app, BrowserWindow, ipcMain } from 'electron'
    import { join } from 'path'
    
    // 窗口管理
    const createWindow = (): void => {
      const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          contextIsolation: true,
          nodeIntegration: false
        }
      })
    }
    ```

    ### Step 3: 预加载脚本开发
    ```typescript
    // 预加载脚本标准模板
    import { contextBridge, ipcRenderer } from 'electron'
    
    contextBridge.exposeInMainWorld('electronAPI', {
      // 安全的API暴露
      invoke: (channel: string, data?: any) => ipcRenderer.invoke(channel, data),
      on: (channel: string, callback: Function) => {
        ipcRenderer.on(channel, (event, ...args) => callback(...args))
      }
    })
    ```

    ### Step 4: 渲染进程开发
    ```vue
    <!-- Vue3组件标准模板 -->
    <template>
      <div class="app-container">
        <!-- 组件内容 -->
      </div>
    </template>
    
    <script setup lang="ts">
    import { ref, onMounted } from 'vue'
    
    // 组件逻辑
    const data = ref<any>(null)
    
    onMounted(async () => {
      // 初始化逻辑
    })
    </script>
    ```

    ### Step 5: AI Agent集成
    ```mermaid
    sequenceDiagram
        participant UI as 渲染进程
        participant Preload as 预加载脚本
        participant Main as 主进程
        participant AI as AI服务
        
        UI->>Preload: 调用AI功能
        Preload->>Main: IPC通信
        Main->>AI: 调用AI服务
        AI->>Main: 返回结果
        Main->>Preload: 发送结果
        Preload->>UI: 更新界面
    ```

    ### Step 6: 构建和部署
    ```bash
    # 开发模式
    npm run dev
    
    # 构建应用
    npm run build
    
    # 打包分发
    npm run dist
    ```
  </process>

  <criteria>
    ## 质量评价标准

    ### 代码质量
    - ✅ TypeScript类型覆盖率 ≥ 95%
    - ✅ ESLint检查无错误和警告
    - ✅ 代码注释覆盖率 ≥ 80%
    - ✅ 函数复杂度控制在合理范围

    ### 性能标准
    - ✅ 应用启动时间 ≤ 3秒
    - ✅ 内存占用合理，无明显泄漏
    - ✅ UI响应时间 ≤ 100ms
    - ✅ AI推理响应时间 ≤ 5秒

    ### 安全标准
    - ✅ 启用contextIsolation
    - ✅ 禁用nodeIntegration
    - ✅ 所有IPC通信经过验证
    - ✅ 外部资源加载安全检查

    ### 用户体验
    - ✅ 界面响应流畅
    - ✅ 错误提示友好
    - ✅ 加载状态明确
    - ✅ 操作反馈及时
  </criteria>
</execution>