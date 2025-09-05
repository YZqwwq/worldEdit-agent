import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm'
import { ModelProvider } from '../types/agent'

/**
 * 模型配置实体
 */
@Entity('model_configs')
export class ModelConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 100 })
  name!: string

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string

  @Column({ type: 'varchar', length: 50 })
  provider!: ModelProvider

  @Column({ type: 'varchar', length: 100 })
  modelName!: string

  @Column({ type: 'text' })
  apiKey!: string

  @Column({ type: 'varchar', length: 500, nullable: true })
  baseURL?: string

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0.7 })
  temperature!: number

  @Column({ type: 'integer', default: 2000 })
  maxTokens!: number

  @Column({ type: 'integer', default: 3 })
  maxRetries!: number

  @Column({ type: 'integer', default: 60000 })
  timeout!: number

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0.9, nullable: true })
  topP?: number

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0, nullable: true })
  frequencyPenalty?: number

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0, nullable: true })
  presencePenalty?: number

  @Column({ type: 'boolean', default: false })
  stream!: boolean

  @Column({ type: 'integer', default: 3 })
  retries!: number

  @Column({ type: 'json', nullable: true })
  stop?: string[]

  @Column({ type: 'boolean', default: false })
  isDefault!: boolean

  @Column({ type: 'boolean', default: true })
  isActive!: boolean

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date

  /**
   * 转换为API使用的ModelConfig类型
   */
  toApiConfig(): import('../types/agent').ModelConfig {
    return {
      provider: this.provider,
      modelName: this.modelName,
      apiKey: this.apiKey,
      baseURL: this.baseURL,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
      maxRetries: this.maxRetries,
      timeout: this.timeout,
      topP: this.topP,
      frequencyPenalty: this.frequencyPenalty,
      presencePenalty: this.presencePenalty,
      stream: this.stream,
      retries: this.retries,
      stop: this.stop
    }
  }

  /**
   * 从API的ModelConfig类型创建实体
   */
  static fromApiConfig(apiConfig: import('../types/agent').ModelConfig, name: string, description?: string): Partial<ModelConfig> {
    return {
      name,
      description,
      provider: apiConfig.provider,
      modelName: apiConfig.modelName,
      apiKey: apiConfig.apiKey,
      baseURL: apiConfig.baseURL,
      temperature: apiConfig.temperature,
      maxTokens: apiConfig.maxTokens,
      maxRetries: apiConfig.maxRetries,
      timeout: apiConfig.timeout,
      topP: apiConfig.topP,
      frequencyPenalty: apiConfig.frequencyPenalty,
      presencePenalty: apiConfig.presencePenalty,
      stream: apiConfig.stream,
      retries: apiConfig.retries,
      stop: apiConfig.stop
    }
  }
}