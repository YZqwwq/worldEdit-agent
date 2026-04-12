import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity('modelconfig')
export class ModelConfig {
  // 自增主键
  @PrimaryGeneratedColumn()
  id!: number

  // 模型密钥（当前为明文存储，后续可迁移至 keytar）
  @Column({
    type: 'text',
    default: ''
  })
  modelkey!: string

  // 模型厂商（openai/anthropic 等）
  @Column({
    type: 'text',
    default: 'openai'
  })
  modeltype!: string

  // 模型 ID（如 qwen-plus / gpt-4o）
  @Column({
    type: 'text',
    default: 'qwen-plus'
  })
  model!: string

  // 前端展示用模型名称
  @Column({
    type: 'text',
    default: '默认模型'
  })
  modelname!: string

  // OpenAI Compatible Base URL（anthropic 通常为空）
  @Column({
    type: 'text',
    default: ''
  })
  baseurl!: string

  // 采样温度 [0,2]
  @Column({
    type: 'real',
    default: 0.9
  })
  temperature!: number

  @Column({
    type: 'text',
    default: ''
  })
  quickmodelkey!: string

  @Column({
    type: 'text',
    default: 'openai'
  })
  quickmodeltype!: string

  @Column({
    type: 'text',
    default: 'qwen3.5-flash'
  })
  quickmodel!: string

  @Column({
    type: 'text',
    default: '快速模型'
  })
  quickmodelname!: string

  @Column({
    type: 'text',
    default: ''
  })
  quickbaseurl!: string

  @Column({
    type: 'real',
    default: 0.3
  })
  quicktemperature!: number

  // 是否启用流式输出
  @Column({
    type: 'boolean',
    default: true
  })
  streaming!: boolean

  // 是否启用 Responses API
  @Column({
    type: 'boolean',
    default: false
  })
  useresponsesapi!: boolean

  // 主 agent 单次模型调用超时（毫秒）
  @Column({
    type: 'integer',
    default: 60000
  })
  mainagenttimeoutms!: number

  // 子 agent 单次模型调用超时（毫秒）
  @Column({
    type: 'integer',
    default: 30000
  })
  childagenttimeoutms!: number

  // 行更新时间（由数据库自动维护）
  @UpdateDateColumn()
  updatedAt!: Date
}
