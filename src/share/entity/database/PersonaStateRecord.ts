import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'

@Entity('persona_state')
export class PersonaStateRecord {
  // 固定单行主键（当前实现仅维护 id=1 的全局人格状态）
  @PrimaryColumn({ type: 'integer' })
  id!: number

  // 人格标识（用于后续扩展多人格）
  @Column({ type: 'text', default: 'default' })
  personaId!: string

  // 人格状态最后更新时间（ISO 字符串）
  @Column({ type: 'text', default: '' })
  lastUpdated!: string

  // 自主性指标 [0,1]
  @Column({ type: 'real', default: 0.5 })
  autonomyLevel!: number

  // 冗长度指标 [0,1]
  @Column({ type: 'real', default: 0.5 })
  verbosityIndex!: number

  // 风险偏好指标 [0,1]
  @Column({ type: 'real', default: 0.5 })
  riskTolerance!: number

  // 语气正式度指标 [0,1]
  @Column({ type: 'real', default: 0.5 })
  formalityScore!: number

  // 当前行为叙事文本（直接参与提示词构造）
  @Column({ type: 'text', default: '默认人格状态' })
  currentBehavioralNarrative!: string

  // 最近交互缓冲区（JSON 字符串）
  @Column({ type: 'text', default: '[]' })
  recentInteractionBufferJson!: string

  // 行更新时间（由数据库自动维护）
  @UpdateDateColumn()
  updatedAt!: Date
}
