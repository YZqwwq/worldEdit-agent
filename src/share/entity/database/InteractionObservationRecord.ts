import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity('interaction_observation')
export class InteractionObservationRecord {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'text', nullable: false })
  type!: string

  @Column({ type: 'text', nullable: false })
  source!: string

  @Column({ type: 'text', default: '' })
  summary!: string

  @Column({ type: 'text', default: '{}' })
  payloadJson!: string

  @CreateDateColumn()
  createdAt!: Date
}
