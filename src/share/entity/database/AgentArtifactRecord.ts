import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import type {
  AgentArtifactBodyFormat,
  AgentArtifactKind,
  AgentArtifactStatus
} from '@share/cache/AItype/states/agentArtifact'

@Entity('agent_artifact')
export class AgentArtifactRecord {
  @PrimaryColumn({ type: 'text' })
  id!: string

  @Column({ type: 'text' })
  eventId!: string

  @Column({ type: 'integer' })
  turnId!: number

  @Column({ type: 'text', default: 'default' })
  sessionId!: string

  @Column({ type: 'text' })
  toolCallId!: string

  @Column({ type: 'text', nullable: true })
  worldId!: string | null

  @Column({ type: 'text', nullable: true })
  entityId!: string | null

  @Column({ type: 'text', nullable: true })
  documentId!: string | null

  @Column({ type: 'text' })
  kind!: AgentArtifactKind

  @Column({ type: 'text' })
  title!: string

  @Column({ type: 'text', default: '' })
  summary!: string

  @Column({ type: 'text' })
  body!: string

  @Column({ type: 'text', default: 'markdown' })
  bodyFormat!: AgentArtifactBodyFormat

  @Column({ type: 'text', default: 'draft' })
  status!: AgentArtifactStatus

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}
