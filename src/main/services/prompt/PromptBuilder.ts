/**
 * Prompt Builder - 提示词构建器
 * 负责将多个提示词层级合并成最终的系统提示词
 */

import { PromptLayer } from './PromptLayer'
import { PromptPriority } from '../../../shared/types/agent'

/**
 * 提示词构建选项
 */
export interface PromptBuildOptions {
  /** 是否包含分隔符 */
  includeSeparators?: boolean
  /** 自定义分隔符 */
  separator?: string
  /** 是否压缩空白 */
  compressWhitespace?: boolean
  /** 最大长度限制 */
  maxLength?: number
}

/**
 * 提示词构建器类
 */
export class PromptBuilder {
  private layers: PromptLayer[] = []
  private options: PromptBuildOptions

  constructor(options: PromptBuildOptions = {}) {
    this.options = {
      includeSeparators: true,
      separator: '\n\n---\n\n',
      compressWhitespace: true,
      maxLength: 8000,
      ...options
    }
  }

  /**
   * 添加提示词层级
   */
  addLayer(layer: PromptLayer): this {
    this.layers.push(layer)
    return this
  }

  /**
   * 批量添加层级
   */
  addLayers(layers: PromptLayer[]): this {
    this.layers.push(...layers)
    return this
  }

  /**
   * 移除指定类型的层级
   */
  removeLayersByType(type: PromptPriority): this {
    this.layers = this.layers.filter(layer => layer.getType() !== type)
    return this
  }

  /**
   * 清空所有层级
   */
  clear(): this {
    this.layers = []
    return this
  }

  /**
   * 获取启用的层级
   */
  private getEnabledLayers(): PromptLayer[] {
    return this.layers
      .filter(layer => layer.isEnabled())
      .sort(PromptLayer.compareByWeight)
  }

  /**
   * 构建最终的提示词
   */
  build(): string {
    const enabledLayers = this.getEnabledLayers()
    
    if (enabledLayers.length === 0) {
      return ''
    }

    // 按优先级分组
    const layersByType = this.groupLayersByType(enabledLayers)
    
    // 按优先级顺序构建内容
    const sections: string[] = []
    
    // 用户提示词（最高优先级）
    if (layersByType.user.length > 0) {
      const userContent = this.buildSection(layersByType.user, 'User Instructions')
      if (userContent) sections.push(userContent)
    }
    
    // 系统提示词（中等优先级）
    if (layersByType.system.length > 0) {
      const systemContent = this.buildSection(layersByType.system, 'System Guidelines')
      if (systemContent) sections.push(systemContent)
    }
    
    // 工具提示词（基础优先级）
    if (layersByType.tool.length > 0) {
      const toolContent = this.buildSection(layersByType.tool, 'Available Tools')
      if (toolContent) sections.push(toolContent)
    }

    // 合并所有部分
    let result = sections.join(this.options.separator || '\n\n')
    
    // 后处理
    result = this.postProcess(result)
    
    return result
  }

  /**
   * 按类型分组层级
   */
  private groupLayersByType(layers: PromptLayer[]): Record<string, PromptLayer[]> {
    return {
      user: layers.filter(l => l.getType() === PromptPriority.USER),
      system: layers.filter(l => l.getType() === PromptPriority.SYSTEM),
      tool: layers.filter(l => l.getType() === PromptPriority.TOOL)
    }
  }

  /**
   * 构建单个部分
   */
  private buildSection(layers: PromptLayer[], title?: string): string {
    const contents = layers
      .map(layer => layer.getContent().trim())
      .filter(content => content.length > 0)
    
    if (contents.length === 0) {
      return ''
    }

    let section = contents.join('\n\n')
    
    if (title && this.options.includeSeparators) {
      section = `## ${title}\n\n${section}`
    }
    
    return section
  }

  /**
   * 后处理提示词
   */
  private postProcess(content: string): string {
    let result = content
    
    // 压缩空白
    if (this.options.compressWhitespace) {
      result = result.replace(/\n{3,}/g, '\n\n') // 最多保留两个换行符
      result = result.replace(/[ \t]+/g, ' ') // 压缩空格和制表符
      result = result.trim()
    }
    
    // 长度限制
    if (this.options.maxLength && result.length > this.options.maxLength) {
      console.warn(`Prompt length (${result.length}) exceeds maximum (${this.options.maxLength}), truncating...`)
      result = result.substring(0, this.options.maxLength - 3) + '...'
    }
    
    return result
  }

  /**
   * 获取构建统计信息
   */
  getStats(): {
    totalLayers: number
    enabledLayers: number
    layersByType: Record<string, number>
    estimatedLength: number
  } {
    const enabledLayers = this.getEnabledLayers()
    const layersByType = this.groupLayersByType(enabledLayers)
    
    return {
      totalLayers: this.layers.length,
      enabledLayers: enabledLayers.length,
      layersByType: {
        user: layersByType.user.length,
        system: layersByType.system.length,
        tool: layersByType.tool.length
      },
      estimatedLength: this.build().length
    }
  }

  /**
   * 创建默认构建器
   */
  static createDefault(): PromptBuilder {
    return new PromptBuilder({
      includeSeparators: true,
      separator: '\n\n',
      compressWhitespace: true,
      maxLength: 8000
    })
  }
}