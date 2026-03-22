import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm'
import type {
  TaskTraceActor,
  TaskTraceStage
} from '@share/cache/AItype/states/taskLifecycleState'

@Entity('task_trace_record')
export class TaskTraceRecord {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'integer', nullable: false })
  taskId!: number

  @Column({ type: 'integer', nullable: true })
  executionId!: number | null

  @Column({ type: 'text', nullable: false })
  actor!: TaskTraceActor

  @Column({ type: 'text', nullable: false })
  stage!: TaskTraceStage

  @Column({ type: 'text', nullable: false, default: '' })
  message!: string

  @Column({ type: 'text', nullable: false, default: '{}' })
  payloadJson!: string

  @CreateDateColumn()
  createdAt!: Date
}
