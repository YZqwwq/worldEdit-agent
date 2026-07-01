import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import type { WorldEntityType } from '@share/cache/worldbuilding/worldbuilding'

export type WorldEntityMentionKind =
  | 'entity_name'
  | 'entity_title'
  | 'entity_slug'
  | 'world_scoped_name'
  | 'manual'

@Entity('world_entity_mention_index_record')
@Index(['worldId'])
@Index(['entityId'])
@Index(['entityType'])
@Index(['mentionText'])
@Index(['enabled'])
export class WorldEntityMentionIndexRecord {
  @PrimaryColumn({ type: 'text' })
  id!: string

  @Column({ type: 'text', nullable: false })
  worldId!: string

  @Column({ type: 'text', nullable: false, default: '' })
  worldName!: string

  @Column({ type: 'text', nullable: false })
  entityId!: string

  @Column({ type: 'text', nullable: false })
  entityType!: WorldEntityType

  @Column({ type: 'text', nullable: false })
  entityName!: string

  @Column({ type: 'text', nullable: false })
  mentionText!: string

  @Column({ type: 'text', nullable: false })
  mentionKind!: WorldEntityMentionKind

  @Column({ type: 'text', nullable: false, default: '' })
  searchText!: string

  @Column({ type: 'text', nullable: false, default: '' })
  sourceField!: string

  @Column({ type: 'real', nullable: false, default: 1 })
  weight!: number

  @Column({ type: 'integer', nullable: false, default: 1 })
  enabled!: number

  @Column({ type: 'text', nullable: false, default: '' })
  sourceUpdatedAt!: string

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}
