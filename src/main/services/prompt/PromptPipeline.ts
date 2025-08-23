/**
 * Prompt Pipeline - 提示词管道核心管理器
 * 统一管理多层级提示词的组合和构建
 */

import { PromptLayer } from './PromptLayer'
import { PromptBuilder, PromptBuildOptions } from './PromptBuilder'
import { 
  PromptPipelineConfig, 
  PromptPriority, 
  PromptLayerConfig 
} from '../../../shared/types/agent'

/**
 * 提示词管道事件
 */
export interface PromptPipelineEvents {
  'layer-added': (layer: PromptLayer) => void
  'layer-removed': (type: PromptPriority) => void
  'layer-updated': (layer: PromptLayer) => void
  'pipeline-rebuilt': (prompt: string) => void
}

/**
 * 提示词管道类
 */
export class PromptPipeline {
  private config: PromptPipelineConfig
  private builder: PromptBuilder
  private layers: Map<PromptPriority, PromptLayer[]> = new Map()
  private eventListeners: Map<keyof PromptPipelineEvents, Function[]> = new Map()
  private cachedPrompt: string | null = null
  private isDirty: boolean = true

  constructor(config?: PromptPipelineConfig, buildOptions?: PromptBuildOptions) {
    this.config = config ? { ...config } : {
      layers: [],
      enableToolPrompts: true,
      promptPriority: [PromptPriority.USER, PromptPriority.SYSTEM, PromptPriority.TOOL]
    }
    this.builder = new PromptBuilder(buildOptions)
    this.initializeLayers()
  }

  /**
   * 初始化层级
   */
  private initializeLayers(): void {
    // 初始化层级映射
    this.layers.set(PromptPriority.USER, [])
    this.layers.set(PromptPriority.SYSTEM, [])
    this.layers.set(PromptPriority.TOOL, [])

    // 从配置中加载层级
    if (this.config.layers && this.config.layers.length > 0) {
      this.config.layers.forEach(layerConfig => {
        this.addLayerFromConfig(layerConfig)
      })
    } else {
      // 使用默认配置创建基础层级
      this.createDefaultLayers()
    }
  }

  /**
   * 创建默认层级
   */
  private createDefaultLayers(): void {
    // 用户提示词层级
    if (this.config.userPrompt) {
      const userLayer = PromptLayer.createUserLayer(this.config.userPrompt)
      this.addLayer(userLayer)
    }

    // 系统提示词层级
    if (this.config.systemPrompt) {
      const systemLayer = PromptLayer.createSystemLayer(this.config.systemPrompt)
      this.addLayer(systemLayer)
    }

    // 工具提示词层级（如果启用）
    if (this.config.enableToolPrompts) {
      const toolLayer = PromptLayer.createToolLayer('Tools will be dynamically loaded.')
      this.addLayer(toolLayer)
    }
  }

  /**
   * 从配置添加层级
   */
  private addLayerFromConfig(config: PromptLayerConfig): void {
    const layer = new PromptLayer(config)
    this.addLayer(layer)
  }

  /**
   * 添加提示词层级
   */
  addLayer(layer: PromptLayer): void {
    const type = layer.getType()
    const layers = this.layers.get(type) || []
    layers.push(layer)
    this.layers.set(type, layers)
    
    this.markDirty()
    this.emit('layer-added', layer)
  }

  /**
   * 移除指定类型的所有层级
   */
  removeLayersByType(type: PromptPriority): void {
    this.layers.set(type, [])
    this.markDirty()
    this.emit('layer-removed', type)
  }

  /**
   * 更新指定类型的层级内容
   */
  updateLayerContent(type: PromptPriority, content: string, index: number = 0): void {
    const layers = this.layers.get(type) || []
    if (layers[index]) {
      layers[index].updateContent(content)
      this.markDirty()
      this.emit('layer-updated', layers[index])
    }
  }

  /**
   * 设置用户提示词
   */
  setUserPrompt(content: string): void {
    this.removeLayersByType(PromptPriority.USER)
    if (content.trim()) {
      const userLayer = PromptLayer.createUserLayer(content)
      this.addLayer(userLayer)
    }
    this.config.userPrompt = content
  }

  /**
   * 设置系统提示词
   */
  setSystemPrompt(content: string): void {
    this.removeLayersByType(PromptPriority.SYSTEM)
    if (content.trim()) {
      const systemLayer = PromptLayer.createSystemLayer(content)
      this.addLayer(systemLayer)
    }
    this.config.systemPrompt = content
  }

  /**
   * 设置工具提示词
   */
  setToolPrompt(content: string): void {
    this.removeLayersByType(PromptPriority.TOOL)
    if (content.trim() && this.config.enableToolPrompts) {
      const toolLayer = PromptLayer.createToolLayer(content)
      this.addLayer(toolLayer)
    }
  }

  /**
   * 启用/禁用工具提示词
   */
  setToolPromptsEnabled(enabled: boolean): void {
    this.config.enableToolPrompts = enabled
    if (!enabled) {
      this.removeLayersByType(PromptPriority.TOOL)
    }
    this.markDirty()
  }

  /**
   * 构建最终提示词
   */
  buildPrompt(): string {
    if (!this.isDirty && this.cachedPrompt !== null) {
      return this.cachedPrompt
    }

    // 清空构建器并添加所有层级
    this.builder.clear()
    
    // 按优先级顺序添加层级
    this.config.promptPriority.forEach(priority => {
      const layers = this.layers.get(priority) || []
      this.builder.addLayers(layers)
    })

    // 构建最终提示词
    this.cachedPrompt = this.builder.build()
    this.isDirty = false
    
    this.emit('pipeline-rebuilt', this.cachedPrompt)
    return this.cachedPrompt
  }

  /**
   * 获取构建统计信息
   */
  getStats() {
    const stats = this.builder.getStats()
    return {
      ...stats,
      isDirty: this.isDirty,
      hasCachedPrompt: this.cachedPrompt !== null,
      config: { ...this.config }
    }
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<PromptPipelineConfig>): void {
    this.config = { ...this.config, ...newConfig }
    
    // 重新初始化层级（如果需要）
    if (newConfig.layers || newConfig.userPrompt !== undefined || 
        newConfig.systemPrompt !== undefined || newConfig.enableToolPrompts !== undefined) {
      this.layers.clear()
      this.initializeLayers()
    }
    
    this.markDirty()
  }

  /**
   * 获取当前配置
   */
  getConfig(): PromptPipelineConfig {
    return { ...this.config }
  }

  /**
   * 标记为需要重建
   */
  private markDirty(): void {
    this.isDirty = true
    this.cachedPrompt = null
  }

  /**
   * 事件监听
   */
  on<K extends keyof PromptPipelineEvents>(event: K, listener: PromptPipelineEvents[K]): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, [])
    }
    this.eventListeners.get(event)!.push(listener)
  }

  /**
   * 移除事件监听
   */
  off<K extends keyof PromptPipelineEvents>(event: K, listener: PromptPipelineEvents[K]): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      const index = listeners.indexOf(listener)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }

  /**
   * 触发事件
   */
  private emit<K extends keyof PromptPipelineEvents>(event: K, ...args: Parameters<PromptPipelineEvents[K]>): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.forEach(listener => {
        try {
          (listener as any)(...args)
        } catch (error) {
          console.error(`Error in prompt pipeline event listener for '${event}':`, error)
        }
      })
    }
  }

  /**
   * 创建默认管道
   */
  static createDefault(systemPrompt?: string): PromptPipeline {
    const config: PromptPipelineConfig = {
      systemPrompt: systemPrompt || 'You are a helpful AI assistant.',
      enableToolPrompts: true,
      promptPriority: [PromptPriority.USER, PromptPriority.SYSTEM, PromptPriority.TOOL],
      layers: []
    }
    
    return new PromptPipeline(config)
  }

  /**
   * 从配置创建管道
   */
  static fromConfig(config: PromptPipelineConfig, buildOptions?: PromptBuildOptions): PromptPipeline {
    return new PromptPipeline(config, buildOptions)
  }
}