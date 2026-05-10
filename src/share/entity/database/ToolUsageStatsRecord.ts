import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn
} from 'typeorm'

@Entity('tool_usage_stats')
export class ToolUsageStatsRecord {
  @PrimaryColumn({ type: 'text' })
  toolName!: string

  @Column({ type: 'text', nullable: false, default: '' })
  capabilityLayer!: string

  @Column({ type: 'integer', nullable: false, default: 0 })
  usageCount!: number

  @Column({ type: 'text', nullable: false, default: '' })
  lastUsedAtIso!: string

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}
