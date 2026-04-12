import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'

@Entity('memory_slot_state')
export class MemorySlotRecord {
  @PrimaryColumn({ type: 'integer' })
  id!: number

  @Column({ type: 'integer', default: 0 })
  lastObservationId!: number

  @Column({ type: 'text', default: '{}' })
  payloadJson!: string

  @UpdateDateColumn()
  updatedAt!: Date
}
