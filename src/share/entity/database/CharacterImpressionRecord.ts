import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn
} from 'typeorm'

@Entity('character_impression_record')
@Index(['updatedAt'])
export class CharacterImpressionRecord {
  @PrimaryColumn({ type: 'text' })
  characterEntityId!: string

  @Column({ type: 'text', nullable: false, default: '' })
  structuredText!: string

  @Column({ type: 'text', nullable: false, default: '' })
  updateMarker!: string

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}
