import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type {
  TaskExecutionStatus,
  TaskExecutorKind
} from '@share/cache/AItype/states/taskLifecycleState'

@Entity('task_execution_record')
export class TaskExecutionRecord {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'integer', nullable: false })
  taskId!: number

  @Column({ type: 'integer', nullable: false, default: 1 })
  runNumber!: number

  @Column({ type: 'text', nullable: false, default: 'general_task_worker' })
  executorKind!: TaskExecutorKind

  @Column({ type: 'text', nullable: false, default: 'queued' })
  status!: TaskExecutionStatus

  @Column({ type: 'text', nullable: false, default: '{}' })
  inputPayloadJson!: string

  @Column({ type: 'text', nullable: false, default: '' })
  resultSummary!: string

  @Column({ type: 'text', nullable: false, default: '{}' })
  reportPayloadJson!: string

  @Column({ type: 'text', nullable: false, default: '' })
  errorReport!: string

  @CreateDateColumn()
  createdAt!: Date

  @Column({ type: 'datetime', nullable: true })
  startedAt!: Date | null

  @Column({ type: 'datetime', nullable: true })
  finishedAt!: Date | null

  @UpdateDateColumn()
  updatedAt!: Date
}
