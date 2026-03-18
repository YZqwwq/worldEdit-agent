import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import type { WorldStatus } from '@share/cache/worldbuilding/worldbuilding'

@Entity('world_record')
export class WorldRecord {
  @PrimaryColumn({ type: 'text' })
  id!: string

  @Column({ type: 'text', nullable: false })
  name!: string

  @Column({ type: 'text', nullable: false, default: '' })
  summary!: string

  @Column({ type: 'text', nullable: false, default: 'active' })
  status!: WorldStatus

  @Column({ type: 'integer', nullable: false, default: 1 })
  schemaVersion!: number

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}
