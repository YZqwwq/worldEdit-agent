/**
 * Prompt Layer - 提示词层级抽象
 * 定义单个提示词层级的行为和属性
 */

import { PromptPriority, PromptLayerConfig } from '../../../shared/types/agent'

/**
 * 提示词层级类
 */
export class PromptLayer {
  private config: PromptLayerConfig

  constructor(config: PromptLayerConfig) {
    this.config = { ...config }
  }

  /**
   * 获取层级类型
   */
  getType(): PromptPriority {
    return this.config.type
  }

  /**
   * 获取提示词内容
   */
  getContent(): string {
    return this.config.content
  }

  /**
   * 获取权重
   */
  getWeight(): number {
    return this.config.weight
  }

  /**
   * 是否启用
   */
  isEnabled(): boolean {
    return this.config.enabled
  }

  /**
   * 更新内容
   */
  updateContent(content: string): void {
    this.config.content = content
  }

  /**
   * 设置启用状态
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled
  }

  /**
   * 设置权重
   */
  setWeight(weight: number): void {
    this.config.weight = weight
  }

  /**
   * 获取完整配置
   */
  getConfig(): PromptLayerConfig {
    return { ...this.config }
  }

  /**
   * 克隆层级
   */
  clone(): PromptLayer {
    return new PromptLayer({ ...this.config })
  }

  /**
   * 比较权重（用于排序）
   */
  static compareByWeight(a: PromptLayer, b: PromptLayer): number {
    return b.getWeight() - a.getWeight() // 降序排列
  }

  /**
   * 创建用户提示词层级
   */
  static createUserLayer(content: string, weight: number = 100): PromptLayer {
    return new PromptLayer({
      type: PromptPriority.USER,
      content,
      enabled: true,
      weight
    })
  }

  /**
   * 创建系统提示词层级
   */
  static createSystemLayer(content: string, weight: number = 50): PromptLayer {
    return new PromptLayer({
      type: PromptPriority.SYSTEM,
      content,
      enabled: true,
      weight
    })
  }

  /**
   * 创建工具提示词层级
   */
  static createToolLayer(content: string, weight: number = 10): PromptLayer {
    return new PromptLayer({
      type: PromptPriority.TOOL,
      content,
      enabled: true,
      weight
    })
  }
}