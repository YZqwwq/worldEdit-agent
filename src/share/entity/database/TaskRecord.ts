import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { TaskExecutorKind, TaskStatus } from '@share/cache/AItype/states/taskLifecycleState'

@Entity('task_record')
export class TaskRecord {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'text', nullable: false })
  title!: string

  @Column({ type: 'text', nullable: false, default: '' })
  goal!: string

  @Column({ type: 'text', nullable: false, default: '' })
  summary!: string

  @Column({ type: 'text', nullable: false, default: 'active' })
  status!: TaskStatus

  @Column({ type: 'text', nullable: false, default: 'general_task_worker' })
  executorKind!: TaskExecutorKind

  @Column({ type: 'text', nullable: false, default: '' })
  progressNotes!: string

  @Column({ type: 'integer', nullable: true })
  createdFromMessageId!: number | null

  @Column({ type: 'integer', nullable: true })
  lastRelatedMessageId!: number | null

  @Column({ type: 'text', nullable: false, default: '' })
  closureSummary!: string

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date

  @Column({ type: 'datetime', nullable: true })
  closedAt!: Date | null
}
