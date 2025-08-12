# AI Agent 模块

一个功能完整的AI智能助手模块，为WorldEdit Agent应用提供对话、创作、配置等核心功能。

## 🚀 功能特性

### 核心功能
- **AI对话聊天** - 支持多模型对话，实时流式响应
- **智能创作辅助** - 提供8种快速工具和模板库
- **对话历史管理** - 完整的历史记录、搜索和导出功能
- **模型配置管理** - 支持多种AI模型提供商和参数调节
- **MCP工具集成** - 集成Model Context Protocol工具生态

### 用户体验
- **主题切换** - 支持亮色/暗色/自动主题
- **快捷键支持** - 全局和页面级快捷键
- **自动保存** - 智能数据保存和恢复
- **性能监控** - 实时性能指标和优化建议
- **响应式设计** - 适配各种屏幕尺寸

### 开发者友好
- **TypeScript支持** - 完整的类型定义
- **组合式API** - Vue 3 Composition API
- **插件化架构** - 模块化和可扩展
- **事件驱动** - 松耦合的事件系统

## 📦 安装使用

### 快速开始

```typescript
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import AIAgent from './ai-agent'

const app = createApp(App)
const router = createRouter({
  history: createWebHistory(),
  routes: []
})

// 快速设置AI Agent模块
AIAgent.setup(app, router, {
  apiConfig: {
    baseUrl: 'http://localhost:3000/api'
  },
  pluginOptions: {
    enableShortcuts: true,
    enableAutoSave: true
  }
})

app.mount('#app')
```

### 手动初始化

```typescript
import { 
  initializeAIAgent, 
  aiAgentRoutes,
  aiAgentPlugin 
} from './ai-agent'

// 初始化模块
const { plugin, api } = initializeAIAgent({
  apiConfig: {
    baseUrl: 'http://localhost:3000/api',
    timeout: 30000
  },
  features: {
    enableSmartWriting: true,
    enableChatHistory: true
  }
})

// 安装插件
app.use(plugin)

// 注册路由
aiAgentRoutes.forEach(route => {
  router.addRoute(route)
})

// 导入样式
import './ai-agent/styles/ai-agent.css'
```

## 🎯 组件使用

### AI对话组件

```vue
<template>
  <AIAgentHub />
</template>

<script setup>
import { AIAgentHub } from './ai-agent'
</script>
```

### 智能创作组件

```vue
<template>
  <SmartWritingAssistant 
    :templates="templates"
    @task-completed="handleTaskCompleted"
  />
</template>

<script setup>
import { SmartWritingAssistant } from './ai-agent'
import { ref } from 'vue'

const templates = ref([])

const handleTaskCompleted = (result) => {
  console.log('创作任务完成:', result)
}
</script>
```

### 模型配置组件

```vue
<template>
  <ModelConfig 
    v-model="modelConfig"
    @config-saved="handleConfigSaved"
  />
</template>

<script setup>
import { ModelConfig } from './ai-agent'
import { ref } from 'vue'

const modelConfig = ref({})

const handleConfigSaved = (config) => {
  console.log('配置已保存:', config)
}
</script>
```

## 🔧 组合式API

### useAIAgent

```typescript
import { useAIAgent } from './ai-agent'

const {
  // 状态
  isConnected,
  currentModel,
  sessions,
  tools,
  
  // 方法
  connect,
  disconnect,
  sendMessage,
  createSession,
  callTool
} = useAIAgent()

// 发送消息
const handleSendMessage = async (content: string) => {
  const response = await sendMessage({
    content,
    type: 'user'
  })
  console.log('AI回复:', response)
}
```

### useSmartWriting

```typescript
import { useSmartWriting } from './ai-agent'

const {
  // 状态
  templates,
  currentTask,
  suggestions,
  
  // 方法
  loadTemplates,
  processTask,
  getSuggestions
} = useSmartWriting()

// 处理写作任务
const handleWritingTask = async (task) => {
  const result = await processTask(task)
  console.log('创作结果:', result)
}
```

### useTheme

```typescript
import { useTheme } from './ai-agent'

const {
  currentTheme,
  availableThemes,
  setTheme,
  toggleTheme
} = useTheme()

// 切换主题
const handleThemeToggle = () => {
  toggleTheme()
}
```

## 🛠 API服务

### 基础用法

```typescript
import { aiAgentAPI } from './ai-agent'

// 测试连接
const status = await aiAgentAPI.testConnection()
console.log('连接状态:', status)

// 获取模型列表
const models = await aiAgentAPI.getModelConfigs()
console.log('可用模型:', models)

// 发送消息
const response = await aiAgentAPI.sendMessage('session-id', {
  content: 'Hello, AI!',
  type: 'user'
})
console.log('AI回复:', response)
```

### 自定义配置

```typescript
import { createAIAgentAPIService } from './ai-agent'

const customAPI = createAIAgentAPIService({
  baseUrl: 'https://api.example.com',
  timeout: 60000,
  retries: 5,
  headers: {
    'X-API-Key': 'your-api-key'
  }
})
```

## 🎨 样式定制

### CSS变量

```css
:root {
  /* 主色调 */
  --ai-primary-color: #3b82f6;
  --ai-primary-hover: #2563eb;
  
  /* 背景色 */
  --ai-bg-primary: #ffffff;
  --ai-bg-secondary: #f8fafc;
  
  /* 文本色 */
  --ai-text-primary: #1f2937;
  --ai-text-secondary: #6b7280;
  
  /* 边框和阴影 */
  --ai-border-color: #e5e7eb;
  --ai-shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}
```

### 暗色主题

```css
[data-theme="dark"] {
  --ai-bg-primary: #1f2937;
  --ai-bg-secondary: #111827;
  --ai-text-primary: #f9fafb;
  --ai-text-secondary: #d1d5db;
  --ai-border-color: #374151;
}
```

### 自定义主题

```typescript
import { createAIAgentPlugin } from './ai-agent'

const plugin = createAIAgentPlugin({
  customTheme: {
    'my-theme': {
      'primary-color': '#ff6b6b',
      'bg-primary': '#fff5f5',
      'text-primary': '#2d3748'
    }
  }
})
```

## ⌨️ 快捷键

### 全局快捷键
- `Ctrl+Shift+A` - 打开AI助手
- `Ctrl+Shift+N` - 新建对话
- `Ctrl+Shift+H` - 查看历史记录
- `Ctrl+Shift+S` - 打开设置
- `Ctrl+Shift+T` - 切换主题

### 对话页面
- `Enter` - 发送消息
- `Shift+Enter` - 换行
- `Ctrl+L` - 清空输入
- `Ctrl+K` - 快速命令
- `Esc` - 取消当前操作

### 创作页面
- `Ctrl+1-8` - 快速工具1-8
- `Ctrl+T` - 选择模板
- `Ctrl+P` - 处理文本
- `Ctrl+O` - 获取建议

## 🔌 插件开发

### 创建自定义插件

```typescript
import { AIAgentPlugin } from './ai-agent'

class MyCustomPlugin extends AIAgentPlugin {
  install(app, options) {
    super.install(app, options)
    
    // 添加自定义功能
    app.config.globalProperties.$myFeature = this.myFeature
  }
  
  myFeature() {
    console.log('自定义功能')
  }
}

const myPlugin = new MyCustomPlugin()
app.use(myPlugin)
```

### 扩展API服务

```typescript
import { AIAgentAPIService } from './ai-agent'

class ExtendedAPIService extends AIAgentAPIService {
  async customEndpoint(data) {
    return this.client.post('/custom', data)
  }
}

const extendedAPI = new ExtendedAPIService()
```

## 📊 性能监控

### 启用监控

```typescript
const { plugin } = initializeAIAgent({
  pluginOptions: {
    debug: true // 启用性能监控
  }
})

// 获取性能统计
const managers = plugin.getManagers()
const stats = managers.performance?.getAllStats()
console.log('性能统计:', stats)
```

### 自定义指标

```typescript
import { eventBus } from './ai-agent'

// 记录自定义指标
eventBus.emit('performance-record', {
  name: 'custom-operation',
  value: performance.now()
})
```

## 🔍 调试和故障排除

### 启用调试模式

```typescript
const { plugin, api } = initializeAIAgent({
  pluginOptions: {
    debug: true
  }
})
```

### 健康检查

```typescript
import { healthCheck } from './ai-agent'

const health = await healthCheck()
if (health.status === 'unhealthy') {
  console.error('模块不健康:', health.errors)
}
```

### 常见问题

#### API连接失败
```typescript
// 检查API配置
const status = await aiAgentAPI.getConnectionStatus()
if (!status.connected) {
  console.error('API连接失败:', status.error)
  // 更新API配置
  aiAgentAPI.updateConfig({
    baseUrl: 'http://new-api-url.com'
  })
}
```

#### 本地存储问题
```typescript
import { storage } from './ai-agent'

// 测试存储
try {
  storage.set('test', 'value')
  const value = storage.get('test')
  console.log('存储正常:', value)
} catch (error) {
  console.error('存储失败:', error)
}
```

## 📝 更新日志

### v1.0.0 (2024-01-XX)
- ✨ 初始版本发布
- 🎯 AI对话聊天功能
- 📝 智能创作辅助
- 📚 对话历史管理
- ⚙️ 模型配置管理
- 🔧 MCP工具集成
- 🎨 主题切换支持
- ⌨️ 快捷键系统
- 💾 自动保存功能
- 📊 性能监控
- 🔌 插件化架构

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 👥 团队

- **WorldEdit Agent Team** - 核心开发团队
- **社区贡献者** - 感谢所有贡献者的支持

## 🔗 相关链接

- [项目主页](https://github.com/worldedit-agent)
- [文档中心](https://docs.worldedit-agent.com)
- [问题反馈](https://github.com/worldedit-agent/issues)
- [讨论社区](https://github.com/worldedit-agent/discussions)

---

**AI Agent 模块** - 让AI助手更智能，让开发更简单 🚀