import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn
} from 'typeorm'
import type { MainAgentEventStatus } from '@share/cache/AItype/states/mainAgentEventState'
import type {
  MainAgentEventConsumer,
  MainAgentEventPriority,
  MainAgentEventType,
  MainAgentInboxSource
} from '@share/cache/AItype/states/taskLifecycleState'

@Entity('main_agent_event_record')
export class MainAgentEventRecord {
  @PrimaryColumn({ type: 'text' })
  id!: string

  @Column({ type: 'text', nullable: false })
  type!: MainAgentEventType

  @Column({ type: 'text', nullable: false })
  source!: MainAgentInboxSource

  @Column({ type: 'text', nullable: false, default: 'default' })
  sessionId!: string

  @Column({ type: 'text', nullable: false })
  priority!: MainAgentEventPriority

  @Column({ type: 'integer', nullable: false })
  createdAtMs!: number

  @Column({ type: 'text', nullable: true })
  dedupeKey!: string | null

  @Column({ type: 'text', nullable: false, default: '{}' })
  payloadJson!: string

  @Column({ type: 'text', nullable: false, default: 'queued' })
  status!: MainAgentEventStatus

  @Column({ type: 'text', nullable: true })
  consumer!: MainAgentEventConsumer | null

  @Column({ type: 'text', nullable: false, default: '' })
  summary!: string

  @Column({ type: 'text', nullable: false, default: '' })
  errorMessage!: string

  @Column({ type: 'datetime', nullable: true })
  startedAt!: Date | null

  @Column({ type: 'datetime', nullable: true })
  finishedAt!: Date | null

  @CreateDateColumn()
  persistedAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}
