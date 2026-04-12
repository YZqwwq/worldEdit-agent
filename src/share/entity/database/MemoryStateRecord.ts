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

  // 距离上次归档后的轮次数
  @Column({ type: 'integer', default: 0 })
  sinceLastArchive!: number

  // 上次归档时间（ISO 字符串）
  @Column({ type: 'text', default: '' })
  lastArchiveTime!: string

  // 归档策略标识
  @Column({ type: 'text', default: 'stage_based' })
  archiveStrategy!: string

  // 模型/API 健康状态（healthy/down/skipped）
  @Column({ type: 'text', default: 'healthy' })
  apiStatus!: string

  // 锚点数组（JSON 字符串）
  @Column({ type: 'text', default: '[]' })
  anchorsJson!: string

  // 触发归档的最小轮次阈值
  @Column({ type: 'integer', default: 6 })
  archiveThreshold!: number

  // 两次归档间最小间隔（毫秒）
  @Column({ type: 'integer', default: 0 })
  archiveMinIntervalMs!: number

  // 短期记忆窗口大小
  @Column({ type: 'integer', default: 6 })
  shortTermLimit!: number

  // 长期稳定记忆结构化快照（JSON）
  @Column({ type: 'text', default: '{}' })
  longTermJson!: string

  // 待归档消息缓冲（JSON）
  @Column({ type: 'text', default: '[]' })
  archiveBufferJson!: string

  // 最近归档的阶段编号
  @Column({ type: 'integer', default: 0 })
  lastStageIndex!: number

  // 最近一次阶段归档时间（ISO）
  @Column({ type: 'text', default: '' })
  lastArchivedAtIso!: string

  // 行更新时间（由数据库自动维护）
  @UpdateDateColumn()
  updatedAt!: Date
}
