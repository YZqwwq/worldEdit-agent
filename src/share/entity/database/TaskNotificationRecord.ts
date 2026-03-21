import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm'
import type {
  TaskNotificationStatus,
  TaskNotificationType
} from '@share/cache/AItype/states/taskLifecycleState'

@Entity('task_notification_record')
export class TaskNotificationRecord {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'integer', nullable: false })
  taskId!: number

  @Column({ type: 'integer', nullable: false })
  executionId!: number

  @Column({ type: 'text', nullable: false })
  type!: TaskNotificationType

  @Column({ type: 'text', nullable: false, default: 'pending' })
  status!: TaskNotificationStatus

  @Column({ type: 'text', nullable: false, default: '{}' })
  payloadJson!: string

  @CreateDateColumn()
  createdAt!: Date

  @Column({ type: 'datetime', nullable: true })
  consumedAt!: Date | null

  @UpdateDateColumn()
  updatedAt!: Date
}
