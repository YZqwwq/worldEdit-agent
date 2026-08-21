import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import type {
  AgentWorldCognitionNodeKind,
  AgentWorldCognitionNodeStatus
} from '@share/cache/worldbuilding/agentWorldCognition'

@Entity('agent_world_cognition_node')
@Index('IDX_agent_world_cognition_node_space_parent', ['spaceId', 'parentId'])
@Index('IDX_agent_world_cognition_node_space_title', ['spaceId', 'title'])
@Index('IDX_agent_world_cognition_node_space_status', ['spaceId', 'status'])
export class AgentWorldCognitionNodeRecord {
  @PrimaryColumn({ type: 'text' })
  id!: string

  @Column({ type: 'text', nullable: false })
  spaceId!: string

  @Column({ type: 'text', nullable: true })
  parentId!: string | null

  @Column({ type: 'text', nullable: false })
  nodeKind!: AgentWorldCognitionNodeKind

  @Column({ type: 'text', nullable: false })
  title!: string

  @Column({ type: 'text', nullable: false, default: '' })
  markdown!: string

  @Column({ type: 'text', nullable: false, default: '[]' })
  documentRefsJson!: string

  @Column({ type: 'integer', nullable: false, default: 1 })
  revision!: number

  @Column({ type: 'text', nullable: false, default: 'available' })
  status!: AgentWorldCognitionNodeStatus

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}
