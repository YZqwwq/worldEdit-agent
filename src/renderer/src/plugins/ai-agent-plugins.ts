/**
 * AI Agent 插件
 * 注册AI Agent相关的全局组件、指令和配置
 */

import type { App } from 'vue'
import type { Router } from 'vue-router'
import { aiAgentRoutes, shortcuts } from '../router/ai-agent'
import { eventBus, storage } from '../utils/ai-agent-utils'

/**
 * AI Agent 插件选项
 */
export interface AIAgentPluginOptions {
  // 是否启用快捷键
  enableShortcuts?: boolean
  // 是否启用自动保存
  enableAutoSave?: boolean
  // 自动保存间隔（毫秒）
  autoSaveInterval?: number
  // 是否启用调试模式
  debug?: boolean
  // 自定义主题
  customTheme?: Record<string, any>
  // API配置
  apiConfig?: {
    baseUrl?: string
    timeout?: number
    retries?: number
  }
}

/**
 * 默认插件选项
 */
const defaultOptions: AIAgentPluginOptions = {
  enableShortcuts: true,
  enableAutoSave: true,
  autoSaveInterval: 30000, // 30秒
  debug: false,
  customTheme: {},
  apiConfig: {
    timeout: 30000,
    retries: 3
  }
}

/**
 * 快捷键管理器
 */
class ShortcutManager {
  private shortcuts: Map<string, Function> = new Map()
  private isEnabled = true

  constructor() {
    this.bindGlobalShortcuts()
  }

  /**
   * 绑定全局快捷键
   */
  private bindGlobalShortcuts(): void {
    document.addEventListener('keydown', this.handleKeyDown.bind(this))
  }

  /**
   * 处理键盘事件
   */
  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.isEnabled) return

    const key = this.getKeyString(event)
    const handler = this.shortcuts.get(key)
    
    if (handler) {
      event.preventDefault()
      event.stopPropagation()
      handler(event)
    }
  }

  /**
   * 获取按键字符串
   */
  private getKeyString(event: KeyboardEvent): string {
    const parts: string[] = []
    
    if (event.ctrlKey) parts.push('Ctrl')
    if (event.altKey) parts.push('Alt')
    if (event.shiftKey) parts.push('Shift')
    if (event.metaKey) parts.push('Meta')
    
    parts.push(event.key)
    
    return parts.join('+')
  }

  /**
   * 注册快捷键
   */
  register(key: string, handler: Function): void {
    this.shortcuts.set(key, handler)
  }

  /**
   * 注销快捷键
   */
  unregister(key: string): void {
    this.shortcuts.delete(key)
  }

  /**
   * 启用快捷键
   */
  enable(): void {
    this.isEnabled = true
  }

  /**
   * 禁用快捷键
   */
  disable(): void {
    this.isEnabled = false
  }

  /**
   * 销毁快捷键管理器
   */
  destroy(): void {
    document.removeEventListener('keydown', this.handleKeyDown.bind(this))
    this.shortcuts.clear()
  }
}

/**
 * 自动保存管理器
 */
class AutoSaveManager {
  private interval: NodeJS.Timeout | null = null
  private isEnabled = false
  private saveInterval = 30000
  private pendingData: Map<string, any> = new Map()

  constructor(interval: number = 30000) {
    this.saveInterval = interval
  }

  /**
   * 启动自动保存
   */
  start(): void {
    if (this.isEnabled) return

    this.isEnabled = true
    this.interval = setInterval(() => {
      this.performAutoSave()
    }, this.saveInterval)
  }

  /**
   * 停止自动保存
   */
  stop(): void {
    if (!this.isEnabled) return

    this.isEnabled = false
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }

  /**
   * 添加待保存数据
   */
  addPendingData(key: string, data: any): void {
    this.pendingData.set(key, data)
  }

  /**
   * 移除待保存数据
   */
  removePendingData(key: string): void {
    this.pendingData.delete(key)
  }

  /**
   * 执行自动保存
   */
  private performAutoSave(): void {
    if (this.pendingData.size === 0) return

    try {
      for (const [key, data] of this.pendingData) {
        storage.set(key, data)
        eventBus.emit('auto-save', { key, data })
      }
      
      // 清空待保存数据
      this.pendingData.clear()
    } catch (error) {
      console.error('自动保存失败:', error)
      eventBus.emit('auto-save-error', error)
    }
  }

  /**
   * 立即保存
   */
  saveNow(): void {
    this.performAutoSave()
  }

  /**
   * 销毁自动保存管理器
   */
  destroy(): void {
    this.stop()
    this.pendingData.clear()
  }
}

/**
 * 主题管理器
 */
class ThemeManager {
  private currentTheme = 'auto'
  private customThemes: Map<string, any> = new Map()

  constructor(customTheme: Record<string, any> = {}) {
    this.registerCustomThemes(customTheme)
    this.loadSavedTheme()
  }

  /**
   * 注册自定义主题
   */
  private registerCustomThemes(themes: Record<string, any>): void {
    for (const [name, theme] of Object.entries(themes)) {
      this.customThemes.set(name, theme)
    }
  }

  /**
   * 加载保存的主题
   */
  private loadSavedTheme(): void {
    const savedTheme = storage.get<string>('ai-agent-theme', 'auto')
    this.setTheme(savedTheme)
  }

  /**
   * 设置主题
   */
  setTheme(theme: string): void {
    this.currentTheme = theme
    storage.set('ai-agent-theme', theme)
    this.applyTheme(theme)
    eventBus.emit('theme-changed', theme)
  }

  /**
   * 应用主题
   */
  private applyTheme(theme: string): void {
    const root = document.documentElement
    
    // 移除所有主题类
    root.classList.remove('theme-light', 'theme-dark')
    root.removeAttribute('data-theme')
    
    if (theme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      root.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
    } else if (theme === 'dark' || theme === 'light') {
      root.setAttribute('data-theme', theme)
    } else if (this.customThemes.has(theme)) {
      // 应用自定义主题
      const customTheme = this.customThemes.get(theme)
      this.applyCustomTheme(customTheme)
    }
  }

  /**
   * 应用自定义主题
   */
  private applyCustomTheme(theme: any): void {
    const root = document.documentElement
    
    for (const [property, value] of Object.entries(theme)) {
      root.style.setProperty(`--${property}`, value as string)
    }
  }

  /**
   * 获取当前主题
   */
  getCurrentTheme(): string {
    return this.currentTheme
  }

  /**
   * 切换主题
   */
  toggleTheme(): void {
    const themes = ['light', 'dark', 'auto']
    const currentIndex = themes.indexOf(this.currentTheme)
    const nextIndex = (currentIndex + 1) % themes.length
    this.setTheme(themes[nextIndex])
  }
}

/**
 * 性能监控器
 */
class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map()
  private isEnabled = false

  /**
   * 启用性能监控
   */
  enable(): void {
    this.isEnabled = true
  }

  /**
   * 禁用性能监控
   */
  disable(): void {
    this.isEnabled = false
  }

  /**
   * 记录性能指标
   */
  record(name: string, value: number): void {
    if (!this.isEnabled) return

    if (!this.metrics.has(name)) {
      this.metrics.set(name, [])
    }

    const values = this.metrics.get(name)!
    values.push(value)

    // 保持最近100个记录
    if (values.length > 100) {
      values.shift()
    }
  }

  /**
   * 获取性能统计
   */
  getStats(name: string): { avg: number; min: number; max: number; count: number } | null {
    const values = this.metrics.get(name)
    if (!values || values.length === 0) return null

    const sum = values.reduce((a, b) => a + b, 0)
    return {
      avg: sum / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      count: values.length
    }
  }

  /**
   * 获取所有指标
   */
  getAllStats(): Record<string, any> {
    const stats: Record<string, any> = {}
    
    for (const [name] of this.metrics) {
      stats[name] = this.getStats(name)
    }
    
    return stats
  }

  /**
   * 清除指标
   */
  clear(name?: string): void {
    if (name) {
      this.metrics.delete(name)
    } else {
      this.metrics.clear()
    }
  }
}

/**
 * AI Agent 插件实例
 */
class AIAgentPlugin {
  private options: AIAgentPluginOptions
  private shortcutManager: ShortcutManager | null = null
  private autoSaveManager: AutoSaveManager | null = null
  private themeManager: ThemeManager | null = null
  private performanceMonitor: PerformanceMonitor | null = null
  private isInstalled = false

  constructor(options: AIAgentPluginOptions = {}) {
    this.options = { ...defaultOptions, ...options }
  }

  /**
   * 安装插件
   */
  install(app: App, router?: Router): void {
    if (this.isInstalled) return

    // 注册全局属性
    app.config.globalProperties.$aiAgent = {
      eventBus,
      storage,
      options: this.options
    }

    // 提供全局注入
    app.provide('aiAgent', {
      eventBus,
      storage,
      options: this.options
    })

    // 初始化管理器
    this.initializeManagers()

    // 注册路由
    if (router) {
      this.registerRoutes(router)
    }

    // 注册全局组件
    this.registerComponents(app)

    // 注册全局指令
    this.registerDirectives(app)

    // 设置错误处理
    this.setupErrorHandling(app)

    // 设置性能监控
    if (this.options.debug) {
      this.setupPerformanceMonitoring(app)
    }

    this.isInstalled = true

    if (this.options.debug) {
      console.log('[AI Agent Plugin] 插件已安装', this.options)
    }
  }

  /**
   * 初始化管理器
   */
  private initializeManagers(): void {
    // 初始化快捷键管理器
    if (this.options.enableShortcuts) {
      this.shortcutManager = new ShortcutManager()
      this.registerShortcuts()
    }

    // 初始化自动保存管理器
    if (this.options.enableAutoSave) {
      this.autoSaveManager = new AutoSaveManager(this.options.autoSaveInterval)
      this.autoSaveManager.start()
    }

    // 初始化主题管理器
    this.themeManager = new ThemeManager(this.options.customTheme)

    // 初始化性能监控器
    if (this.options.debug) {
      this.performanceMonitor = new PerformanceMonitor()
      this.performanceMonitor.enable()
    }
  }

  /**
   * 注册快捷键
   */
  private registerShortcuts(): void {
    if (!this.shortcutManager) return

    // 注册全局快捷键
    shortcuts.global.forEach(shortcut => {
      this.shortcutManager!.register(shortcut.key, shortcut.action)
    })

    // 监听页面变化，注册页面特定快捷键
    eventBus.on('route-changed', (route: any) => {
      this.updatePageShortcuts(route.name)
    })
  }

  /**
   * 更新页面快捷键
   */
  private updatePageShortcuts(routeName: string): void {
    if (!this.shortcutManager) return

    // 清除之前的页面快捷键
    // 这里简化处理，实际应该维护一个页面快捷键的映射
    
    // 根据页面注册对应快捷键
    if (routeName === 'AIChat' && shortcuts.chat) {
      shortcuts.chat.forEach(shortcut => {
        this.shortcutManager!.register(shortcut.key, () => {
          eventBus.emit(`shortcut:${shortcut.action}`)
        })
      })
    } else if (routeName === 'SmartWriting' && shortcuts.writing) {
      shortcuts.writing.forEach(shortcut => {
        this.shortcutManager!.register(shortcut.key, () => {
          eventBus.emit(`shortcut:${shortcut.action}`)
        })
      })
    }
  }

  /**
   * 注册路由
   */
  private registerRoutes(router: Router): void {
    aiAgentRoutes.forEach(route => {
      router.addRoute(route)
    })
  }

  /**
   * 注册全局组件
   */
  private registerComponents(app: App): void {
    // 这里可以注册一些全局的AI Agent组件
    // 例如：加载指示器、错误提示等
  }

  /**
   * 注册全局指令
   */
  private registerDirectives(app: App): void {
    // v-auto-save 指令
    app.directive('auto-save', {
      mounted(el, binding) {
        const { value, arg } = binding
        const key = arg || 'auto-save-data'
        
        const saveData = () => {
          if (typeof value === 'function') {
            const data = value()
            if (data !== undefined) {
              storage.set(key, data)
            }
          }
        }

        // 监听输入事件
        el.addEventListener('input', saveData)
        el.addEventListener('change', saveData)
        
        // 保存清理函数
        el._autoSaveCleanup = () => {
          el.removeEventListener('input', saveData)
          el.removeEventListener('change', saveData)
        }
      },
      
      unmounted(el) {
        if (el._autoSaveCleanup) {
          el._autoSaveCleanup()
        }
      }
    })

    // v-shortcut 指令
    app.directive('shortcut', {
      mounted(el, binding) {
        const { value, arg } = binding
        const key = arg
        
        if (key && typeof value === 'function') {
          const handler = (event: KeyboardEvent) => {
            if (el.contains(event.target as Node)) {
              value(event)
            }
          }
          
          document.addEventListener('keydown', handler)
          el._shortcutHandler = handler
        }
      },
      
      unmounted(el) {
        if (el._shortcutHandler) {
          document.removeEventListener('keydown', el._shortcutHandler)
        }
      }
    })

    // v-tooltip 指令
    app.directive('tooltip', {
      mounted(el, binding) {
        const { value } = binding
        if (value) {
          el.setAttribute('data-tooltip', value)
          el.classList.add('tooltip')
        }
      },
      
      updated(el, binding) {
        const { value } = binding
        if (value) {
          el.setAttribute('data-tooltip', value)
        } else {
          el.removeAttribute('data-tooltip')
          el.classList.remove('tooltip')
        }
      }
    })
  }

  /**
   * 设置错误处理
   */
  private setupErrorHandling(app: App): void {
    app.config.errorHandler = (error, instance, info) => {
      console.error('[AI Agent Plugin] 错误:', error, info)
      eventBus.emit('error', { error, instance, info })
      
      if (this.performanceMonitor) {
        this.performanceMonitor.record('errors', 1)
      }
    }
  }

  /**
   * 设置性能监控
   */
  private setupPerformanceMonitoring(app: App): void {
    if (!this.performanceMonitor) return

    // 监控组件渲染时间
    const originalMount = app.mount
    app.mount = function(rootContainer) {
      const start = performance.now()
      const result = originalMount.call(this, rootContainer)
      const end = performance.now()
      
      if (this.performanceMonitor) {
        this.performanceMonitor.record('app-mount-time', end - start)
      }
      
      return result
    }.bind(this)

    // 监控路由切换时间
    eventBus.on('route-change-start', () => {
      this.performanceMonitor!.record('route-change-start', performance.now())
    })

    eventBus.on('route-change-end', () => {
      const startTime = this.performanceMonitor!.getStats('route-change-start')?.max || 0
      const endTime = performance.now()
      this.performanceMonitor!.record('route-change-duration', endTime - startTime)
    })
  }

  /**
   * 获取管理器实例
   */
  getManagers() {
    return {
      shortcut: this.shortcutManager,
      autoSave: this.autoSaveManager,
      theme: this.themeManager,
      performance: this.performanceMonitor
    }
  }

  /**
   * 销毁插件
   */
  destroy(): void {
    if (this.shortcutManager) {
      this.shortcutManager.destroy()
      this.shortcutManager = null
    }

    if (this.autoSaveManager) {
      this.autoSaveManager.destroy()
      this.autoSaveManager = null
    }

    this.themeManager = null
    this.performanceMonitor = null
    this.isInstalled = false
  }
}

/**
 * 创建AI Agent插件实例
 */
export function createAIAgentPlugin(options: AIAgentPluginOptions = {}): AIAgentPlugin {
  return new AIAgentPlugin(options)
}

/**
 * 默认插件实例
 */
export const aiAgentPlugin = createAIAgentPlugin()

/**
 * 导出插件类和相关类型
 */
export {
  AIAgentPlugin,
  ShortcutManager,
  AutoSaveManager,
  ThemeManager,
  PerformanceMonitor
}

/**
 * Vue插件安装函数
 */
export default {
  install(app: App, options: AIAgentPluginOptions = {}) {
    const plugin = createAIAgentPlugin(options)
    plugin.install(app)
    
    // 将插件实例挂载到app上，方便访问
    app.config.globalProperties.$aiAgentPlugin = plugin
  }
}