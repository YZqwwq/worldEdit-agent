import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm'

/**
 * 支持的AI模型提供商
 */
export enum ModelProvider {
  OPENAI = 'openai',
  CLAUDE = 'claude',
  DEEPSEEK = 'deepseek'
}

/**
 * 消息类型枚举
 */
export enum MessageType {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
  TOOL = 'tool'
}

/**
 * 提示词优先级枚举
 */
export enum PromptPriority {
  USER = 'user',
  SYSTEM = 'system',
  TOOL = 'tool'
}

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
}