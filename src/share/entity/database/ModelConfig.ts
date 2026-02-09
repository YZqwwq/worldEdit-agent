import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity('modelconfig')
export class ModelConfig {
  @PrimaryGeneratedColumn()
  id!: number;

  // 模型密钥
  @Column({
    type: 'varchar',
    length: 255,
    nullable: false,
  })
  modelkey!: string;

  // 区分模型厂商以做不同的适配
  @Column({
    type: 'varchar',
    length: 255,
    nullable: false,
  })
  modeltype!: string;

  // 模型类型 例如 gpt-3.5-turbo
  @Column({
    type: 'varchar',
    length: 255,
    nullable: false,
  })
  model!: string;


  // 模型名称 例如 智能助手
  @Column({
    type: 'varchar',
    length: 255,
    nullable: false,
  })
  modelname!: string;

}