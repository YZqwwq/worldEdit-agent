import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'

@Entity('agent_life_state')
export class AgentLifeStateRecord {
  @PrimaryColumn({ type: 'integer' })
  id!: number

  @Column({ type: 'text', nullable: false, default: '' })
  narrative!: string

  @Column({ type: 'integer', nullable: false, default: 0 })
  revision!: number

  @Column({ type: 'integer', nullable: true })
  sourceTurnId!: number | null

  @UpdateDateColumn()
  updatedAt!: Date
}
