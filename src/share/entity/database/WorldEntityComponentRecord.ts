import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn
} from 'typeorm'

@Entity('world_entity_component_record')
@Index(['entityId', 'componentType'], { unique: true })
export class WorldEntityComponentRecord {
  @PrimaryColumn({ type: 'text' })
  id!: string

  @Column({ type: 'text', nullable: false })
  entityId!: string

  @Column({ type: 'text', nullable: false })
  componentType!: string

  @Column({ type: 'integer', nullable: false, default: 1 })
  schemaVersion!: number

  @Column({ type: 'text', nullable: false, default: '{}' })
  dataJson!: string

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}
