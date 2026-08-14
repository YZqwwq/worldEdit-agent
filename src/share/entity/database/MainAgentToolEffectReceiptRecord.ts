import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm'
import type {
  ToolEffectRecoveryMode,
  ToolEffectStatus
} from '@share/cache/AItype/states/toolEffect'

@Entity('main_agent_tool_effect_receipt')
@Index(['changeSetId', 'persistedAt'])
@Index(['eventId', 'turnId'])
@Index(['toolCallId'])
@Index(['eventId', 'turnId', 'toolCallId', 'effectKey'], { unique: true })
export class MainAgentToolEffectReceiptRecord {
  @PrimaryColumn({ type: 'text' })
  id!: string

  @Column({ type: 'text', nullable: false })
  changeSetId!: string

  @Column({ type: 'text', nullable: false })
  eventId!: string

  @Column({ type: 'integer', nullable: false })
  turnId!: number

  @Column({ type: 'text', nullable: false })
  toolCallId!: string

  @Column({ type: 'text', nullable: false, default: 'primary' })
  effectKey!: string

  @Column({ type: 'text', nullable: false })
  toolName!: string

  @Column({ type: 'text', nullable: false, default: 'best_effort' })
  recoveryMode!: ToolEffectRecoveryMode

  @Column({ type: 'text', nullable: false })
  operation!: string

  @Column({ type: 'text', nullable: false })
  subjectType!: string

  @Column({ type: 'text', nullable: false })
  subjectId!: string

  @Column({ type: 'text', nullable: true })
  subjectLabel!: string | null

  @Column({ type: 'text', nullable: false })
  status!: ToolEffectStatus

  @Column({ type: 'integer', nullable: true })
  beforeRevision!: number | null

  @Column({ type: 'integer', nullable: true })
  afterRevision!: number | null

  @Column({ type: 'text', nullable: true })
  beforeRef!: string | null

  @Column({ type: 'text', nullable: true })
  afterRef!: string | null

  @Column({ type: 'text', nullable: false })
  summary!: string

  @Column({ type: 'text', nullable: true })
  evidenceRef!: string | null

  @Column({ type: 'text', nullable: true })
  diffRef!: string | null

  @Column({ type: 'text', nullable: true })
  resultRef!: string | null

  @Column({ type: 'text', nullable: false, default: '{}' })
  payloadJson!: string

  @Column({ type: 'integer', nullable: false, default: 0 })
  compensatable!: number

  @CreateDateColumn()
  persistedAt!: Date

  @Column({ type: 'datetime', nullable: true })
  settledAt!: Date | null
}
