import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm'

@Entity('agent_world_cognition_space')
@Index('IDX_agent_world_cognition_space_owner', ['agentId', 'worldId'], { unique: true })
export class AgentWorldCognitionSpaceRecord {
  @PrimaryColumn({ type: 'text' })
  id!: string

  @Column({ type: 'text', nullable: false })
  agentId!: string

  @Column({ type: 'text', nullable: false })
  worldId!: string

  @Column({ type: 'integer', nullable: false, default: 0 })
  revision!: number

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}
