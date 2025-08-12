/**
 * AI Agent 路由配置
 * 定义AI Agent相关页面的路由规则
 */

import type { RouteRecordRaw } from 'vue-router'

// 懒加载组件
const AIAgentHub = () => import('../components/AIAgentHub.vue')
const AIChat = () => import('../components/AIChat.vue')
const SmartWritingAssistant = () => import('../components/SmartWritingAssistant.vue')
const ChatHistory = () => import('../components/ChatHistory.vue')
const ModelConfig = () => import('../components/ModelConfig.vue')

/**
 * AI Agent 路由配置
 */
export const aiAgentRoutes: RouteRecordRaw[] = [
  {
    path: '/ai-agent',
    name: 'AIAgent',
    component: AIAgentHub,
    meta: {
      title: 'AI智能助手',
      icon: 'robot',
      requiresAuth: false,
      keepAlive: true
    },
    children: [
      {
        path: '',
        name: 'AIAgentHome',
        component: AIChat,
        meta: {
          title: 'AI对话',
          icon: 'chat',
          keepAlive: true
        }
      },
      {
        path: 'chat',
        name: 'AIChat',
        component: AIChat,
        meta: {
          title: 'AI对话',
          icon: 'chat',
          keepAlive: true
        }
      },
      {
        path: 'chat/:sessionId',
        name: 'AIChatSession',
        component: AIChat,
        props: true,
        meta: {
          title: 'AI对话',
          icon: 'chat',
          keepAlive: true
        }
      },
      {
        path: 'writing',
        name: 'SmartWriting',
        component: SmartWritingAssistant,
        meta: {
          title: '智能创作',
          icon: 'edit',
          keepAlive: true
        }
      },
      {
        path: 'history',
        name: 'ChatHistory',
        component: ChatHistory,
        meta: {
          title: '对话历史',
          icon: 'history',
          keepAlive: false
        }
      },
      {
        path: 'config',
        name: 'ModelConfig',
        component: ModelConfig,
        meta: {
          title: '模型配置',
          icon: 'settings',
          keepAlive: false
        }
      }
    ]
  }
]

/**
 * AI Agent 导航菜单配置
 */
export const aiAgentMenus = [
  {
    id: 'ai-chat',
    name: 'AI对话',
    icon: 'chat',
    path: '/ai-agent/chat',
    description: '与AI助手进行智能对话',
    category: 'primary'
  },
  {
    id: 'smart-writing',
    name: '智能创作',
    icon: 'edit',
    path: '/ai-agent/writing',
    description: 'AI辅助写作和内容创作',
    category: 'primary'
  },
  {
    id: 'chat-history',
    name: '对话历史',
    icon: 'history',
    path: '/ai-agent/history',
    description: '查看和管理历史对话记录',
    category: 'secondary'
  },
  {
    id: 'model-config',
    name: '模型配置',
    icon: 'settings',
    path: '/ai-agent/config',
    description: '配置AI模型和参数',
    category: 'secondary'
  }
]

/**
 * 快速工具配置
 */
export const quickTools = [
  {
    id: 'summarize',
    name: '文本总结',
    icon: 'summary',
    description: '快速总结长文本内容',
    action: 'summarize',
    category: 'text'
  },
  {
    id: 'translate',
    name: '文本翻译',
    icon: 'translate',
    description: '多语言文本翻译',
    action: 'translate',
    category: 'text'
  },
  {
    id: 'polish',
    name: '文本润色',
    icon: 'polish',
    description: '优化文本表达和语法',
    action: 'polish',
    category: 'text'
  },
  {
    id: 'expand',
    name: '内容扩写',
    icon: 'expand',
    description: '扩展和丰富文本内容',
    action: 'expand',
    category: 'text'
  },
  {
    id: 'code-explain',
    name: '代码解释',
    icon: 'code',
    description: '解释代码功能和逻辑',
    action: 'explain-code',
    category: 'code'
  },
  {
    id: 'code-optimize',
    name: '代码优化',
    icon: 'optimize',
    description: '优化代码性能和结构',
    action: 'optimize-code',
    category: 'code'
  },
  {
    id: 'code-review',
    name: '代码审查',
    icon: 'review',
    description: '检查代码质量和问题',
    action: 'review-code',
    category: 'code'
  },
  {
    id: 'brainstorm',
    name: '头脑风暴',
    icon: 'lightbulb',
    description: '创意思维和想法生成',
    action: 'brainstorm',
    category: 'creative'
  }
]

/**
 * 路由守卫配置
 */
export const aiAgentGuards = {
  /**
   * 路由进入前的检查
   */
  beforeEnter: (to: any, from: any, next: any) => {
    // 检查AI Agent是否已初始化
    const isInitialized = localStorage.getItem('ai-agent-initialized')
    
    if (!isInitialized && to.name !== 'ModelConfig') {
      // 如果未初始化且不是配置页面，重定向到配置页面
      next({ name: 'ModelConfig', query: { redirect: to.fullPath } })
    } else {
      next()
    }
  },
  
  /**
   * 路由离开前的检查
   */
  beforeLeave: (to: any, from: any, next: any) => {
    // 检查是否有未保存的内容
    const hasUnsavedContent = sessionStorage.getItem('ai-agent-unsaved-content')
    
    if (hasUnsavedContent) {
      const confirmed = confirm('您有未保存的内容，确定要离开吗？')
      if (confirmed) {
        sessionStorage.removeItem('ai-agent-unsaved-content')
        next()
      } else {
        next(false)
      }
    } else {
      next()
    }
  }
}

/**
 * 面包屑导航配置
 */
export const breadcrumbConfig = {
  '/ai-agent': {
    title: 'AI智能助手',
    icon: 'robot'
  },
  '/ai-agent/chat': {
    title: 'AI对话',
    icon: 'chat',
    parent: '/ai-agent'
  },
  '/ai-agent/writing': {
    title: '智能创作',
    icon: 'edit',
    parent: '/ai-agent'
  },
  '/ai-agent/history': {
    title: '对话历史',
    icon: 'history',
    parent: '/ai-agent'
  },
  '/ai-agent/config': {
    title: '模型配置',
    icon: 'settings',
    parent: '/ai-agent'
  }
}

/**
 * 页面标题配置
 */
export const pageTitles = {
  'AIAgent': 'AI智能助手',
  'AIAgentHome': 'AI对话',
  'AIChat': 'AI对话',
  'AIChatSession': 'AI对话',
  'SmartWriting': '智能创作',
  'ChatHistory': '对话历史',
  'ModelConfig': '模型配置'
}

/**
 * 快捷键配置
 */
export const shortcuts = {
  // 全局快捷键
  global: [
    {
      key: 'Ctrl+Shift+A',
      description: '打开AI助手',
      action: () => {
        // 导航到AI助手页面
        window.location.hash = '#/ai-agent'
      }
    },
    {
      key: 'Ctrl+Shift+C',
      description: '新建对话',
      action: () => {
        // 触发新建对话事件
        window.dispatchEvent(new CustomEvent('ai-agent:new-chat'))
      }
    },
    {
      key: 'Ctrl+Shift+W',
      description: '打开智能创作',
      action: () => {
        window.location.hash = '#/ai-agent/writing'
      }
    }
  ],
  
  // 对话页面快捷键
  chat: [
    {
      key: 'Ctrl+Enter',
      description: '发送消息',
      action: 'send-message'
    },
    {
      key: 'Ctrl+Shift+Enter',
      description: '换行',
      action: 'new-line'
    },
    {
      key: 'Escape',
      description: '停止生成',
      action: 'stop-generation'
    },
    {
      key: 'Ctrl+K',
      description: '清空输入',
      action: 'clear-input'
    },
    {
      key: 'Ctrl+/',
      description: '显示快捷键帮助',
      action: 'show-shortcuts'
    }
  ],
  
  // 创作页面快捷键
  writing: [
    {
      key: 'Ctrl+S',
      description: '保存内容',
      action: 'save-content'
    },
    {
      key: 'Ctrl+Z',
      description: '撤销',
      action: 'undo'
    },
    {
      key: 'Ctrl+Y',
      description: '重做',
      action: 'redo'
    },
    {
      key: 'Ctrl+A',
      description: '全选',
      action: 'select-all'
    },
    {
      key: 'Ctrl+F',
      description: '查找替换',
      action: 'find-replace'
    }
  ]
}

/**
 * 权限配置
 */
export const permissions = {
  // 功能权限
  features: {
    'ai-chat': {
      name: 'AI对话',
      description: '使用AI对话功能',
      required: false
    },
    'smart-writing': {
      name: '智能创作',
      description: '使用智能创作功能',
      required: false
    },
    'chat-history': {
      name: '对话历史',
      description: '查看对话历史',
      required: false
    },
    'model-config': {
      name: '模型配置',
      description: '配置AI模型',
      required: false
    },
    'export-data': {
      name: '数据导出',
      description: '导出对话数据',
      required: false
    },
    'import-data': {
      name: '数据导入',
      description: '导入对话数据',
      required: false
    }
  },
  
  // 操作权限
  actions: {
    'create-session': {
      name: '创建会话',
      description: '创建新的对话会话',
      required: false
    },
    'delete-session': {
      name: '删除会话',
      description: '删除对话会话',
      required: false
    },
    'modify-config': {
      name: '修改配置',
      description: '修改AI模型配置',
      required: false
    },
    'use-tools': {
      name: '使用工具',
      description: '使用AI工具功能',
      required: false
    }
  }
}

/**
 * 默认配置
 */
export const defaultConfig = {
  // 默认路由
  defaultRoute: '/ai-agent/chat',
  
  // 默认页面大小
  defaultPageSize: 20,
  
  // 默认主题
  defaultTheme: 'auto',
  
  // 默认语言
  defaultLanguage: 'zh-CN',
  
  // 缓存配置
  cache: {
    // 会话缓存时间（毫秒）
    sessionCacheTime: 24 * 60 * 60 * 1000, // 24小时
    
    // 最大缓存会话数
    maxCachedSessions: 100,
    
    // 自动清理缓存
    autoCleanCache: true
  },
  
  // 性能配置
  performance: {
    // 虚拟滚动阈值
    virtualScrollThreshold: 100,
    
    // 防抖延迟（毫秒）
    debounceDelay: 300,
    
    // 节流延迟（毫秒）
    throttleDelay: 100,
    
    // 懒加载延迟（毫秒）
    lazyLoadDelay: 200
  },
  
  // UI配置
  ui: {
    // 动画持续时间（毫秒）
    animationDuration: 300,
    
    // 通知显示时间（毫秒）
    notificationDuration: 5000,
    
    // 工具提示延迟（毫秒）
    tooltipDelay: 500,
    
    // 最大显示消息数
    maxDisplayMessages: 50
  }
}

/**
 * 路由元信息类型定义
 */
export interface AIAgentRouteMeta {
  title?: string
  icon?: string
  requiresAuth?: boolean
  keepAlive?: boolean
  permissions?: string[]
  category?: 'primary' | 'secondary' | 'utility'
  hidden?: boolean
  badge?: string | number
  shortcut?: string
}

/**
 * 导出所有配置
 */
export default {
  routes: aiAgentRoutes,
  menus: aiAgentMenus,
  quickTools,
  guards: aiAgentGuards,
  breadcrumbs: breadcrumbConfig,
  titles: pageTitles,
  shortcuts,
  permissions,
  config: defaultConfig
}