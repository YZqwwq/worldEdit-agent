import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn
} from 'typeorm'
import type { WorldEntityType, WorldStatus } from '@share/cache/worldbuilding/worldbuilding'

@Entity('world_entity_record')
@Index(['worldId', 'type'])
@Index(['worldId', 'name'])
@Index(['worldId', 'slug'], { unique: false })
export class WorldEntityRecord {
  @PrimaryColumn({ type: 'text' })
  id!: string

  @Column({ type: 'text', nullable: false })
  worldId!: string

  @Column({ type: 'text', nullable: false })
  type!: WorldEntityType

  @Column({ type: 'text', nullable: false })
  name!: string

  @Column({ type: 'text', nullable: false, default: '' })
  slug!: string

  @Column({ type: 'text', nullable: false, default: '' })
  title!: string

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
