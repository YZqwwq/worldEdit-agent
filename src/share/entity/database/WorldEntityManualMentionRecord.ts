import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import type { WorldEntityType } from '@share/cache/worldbuilding/worldbuilding'

export type WorldEntityManualMentionSource = 'user' | 'agent' | 'reading_extraction' | 'system'

@Entity('world_entity_manual_mention_record')
@Index(['worldId'])
@Index(['entityId'])
@Index(['entityType'])
@Index(['normalizedMentionText'])
@Index(['entityId', 'normalizedMentionText'])
@Index(['enabled'])
export class WorldEntityManualMentionRecord {
  @PrimaryColumn({ type: 'text' })
  id!: string

  @Column({ type: 'text', nullable: false })
  worldId!: string

  @Column({ type: 'text', nullable: false })
  entityId!: string

  @Column({ type: 'text', nullable: false })
  entityType!: WorldEntityType

  @Column({ type: 'text', nullable: false })
  entityName!: string

  @Column({ type: 'text', nullable: false })
  mentionText!: string

  @Column({ type: 'text', nullable: false })
  normalizedMentionText!: string

  @Column({ type: 'real', nullable: false, default: 1 })
  weight!: number

  @Column({ type: 'text', nullable: false, default: 'agent' })
  source!: WorldEntityManualMentionSource

  @Column({ type: 'text', nullable: false, default: '' })
  note!: string

  @Column({ type: 'integer', nullable: false, default: 1 })
  enabled!: number

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}
