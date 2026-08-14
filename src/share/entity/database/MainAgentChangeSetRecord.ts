import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm'
import type {
  ToolChangeSetLifecycle,
  ToolChangeSetScopeType
} from '@share/cache/AItype/states/toolEffect'

@Entity('main_agent_change_set')
@Index(['scopeType', 'scopeId'])
@Index(['eventId', 'turnId'])
export class MainAgentChangeSetRecord {
  @PrimaryColumn({ type: 'text' })
  id!: string

  @Column({ type: 'text', nullable: false })
  scopeType!: ToolChangeSetScopeType

  @Column({ type: 'text', nullable: false })
  scopeId!: string

  @Column({ type: 'text', nullable: false })
  eventId!: string

  @Column({ type: 'integer', nullable: false })
  turnId!: number

  @Column({ type: 'text', nullable: false, default: 'default' })
  sessionId!: string

  @Column({ type: 'text', nullable: false, default: 'open' })
  lifecycle!: ToolChangeSetLifecycle

  @Column({ type: 'text', nullable: true })
  title!: string | null

  @CreateDateColumn()
  createdAt!: Date

  @Column({ type: 'datetime', nullable: true })
  sealedAt!: Date | null
}
