import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn
} from 'typeorm'
import type { RelationDirection } from '@share/cache/worldbuilding/worldbuilding'

@Entity('world_entity_relation_record')
@Index(['worldId', 'relationType'])
@Index(['sourceEntityId'])
@Index(['targetEntityId'])
export class WorldEntityRelationRecord {
  @PrimaryColumn({ type: 'text' })
  id!: string

  @Column({ type: 'text', nullable: false })
  worldId!: string

  @Column({ type: 'text', nullable: false })
  sourceEntityId!: string

  @Column({ type: 'text', nullable: false })
  targetEntityId!: string

  @Column({ type: 'text', nullable: false })
  relationType!: string

  @Column({ type: 'text', nullable: false, default: 'directed' })
  direction!: RelationDirection

  @Column({ type: 'text', nullable: false, default: '{}' })
  dataJson!: string

  @Column({ type: 'text', nullable: false, default: '' })
  startTimeId!: string

  @Column({ type: 'text', nullable: false, default: '' })
  endTimeId!: string

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}
