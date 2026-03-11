import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'

@Entity('memory_state')
export class MemoryStateRecord {
  // 固定单行主键（当前实现仅维护 id=1 的全局记忆状态）
  @PrimaryColumn({ type: 'integer' })
  id!: number

  // 会话标识（用于后续扩展多会话）
  @Column({ type: 'text', default: 'default' })
  sessionId!: string

  // 状态创建时间（ISO 字符串）
  @Column({ type: 'text', default: '' })
  createdAtIso!: string

  // 累计总轮次
  @Column({ type: 'integer', default: 0 })
  totalTurns!: number

  // 当前短期窗口轮次
  @Column({ type: 'integer', default: 0 })
  windowTurns!: number

  // 距离上次压缩后的轮次数
  @Column({ type: 'integer', default: 0 })
  sinceLastCompress!: number

  // 上次压缩时间（ISO 字符串）
  @Column({ type: 'text', default: '' })
  lastCompressTime!: string

  // 压缩策略标识（如 time_based）
  @Column({ type: 'text', default: 'time_based' })
  compressStrategy!: string

  // 模型/API 健康状态（healthy/down/skipped）
  @Column({ type: 'text', default: 'healthy' })
  apiStatus!: string

  // 锚点数组（JSON 字符串）
  @Column({ type: 'text', default: '[]' })
  anchorsJson!: string

  // 触发压缩的最小轮次阈值
  @Column({ type: 'integer', default: 6 })
  compressThreshold!: number

  // 两次压缩间最小间隔（毫秒）
  @Column({ type: 'integer', default: 0 })
  compressMinIntervalMs!: number

  // 短期记忆窗口大小
  @Column({ type: 'integer', default: 6 })
  shortTermLimit!: number

  // 长期摘要正文（Markdown/文本）
  @Column({ type: 'text', default: '' })
  summary!: string

  // 行更新时间（由数据库自动维护）
  @UpdateDateColumn()
  updatedAt!: Date
}
