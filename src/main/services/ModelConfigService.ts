import { Repository } from 'typeorm'
import { ModelConfig } from '../../shared/entities/ModelConfig.entity'
import { TypeORMService } from './TypeORMService'
import type { ModelConfig as ApiModelConfig } from '../../shared/types/agent'

/**
 * 模型配置服务类
 */
export class ModelConfigService {
  private repository: Repository<ModelConfig> | null = null

  constructor(private typeormService: TypeORMService) {}

  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    const dataSource = await this.typeormService.getDataSource()
    this.repository = dataSource.getRepository(ModelConfig)
  }

  /**
   * 获取所有模型配置
   */
  async getAllConfigs(): Promise<ModelConfig[]> {
    if (!this.repository) {
      throw new Error('ModelConfigService not initialized')
    }
    return await this.repository.find({
      order: { createdAt: 'DESC' }
    })
  }

  /**
   * 根据ID获取模型配置
   */
  async getConfigById(id: string): Promise<ModelConfig | null> {
    if (!this.repository) {
      throw new Error('ModelConfigService not initialized')
    }
    return await this.repository.findOne({ where: { id } })
  }

  /**
   * 获取默认模型配置
   */
  async getDefaultConfig(): Promise<ModelConfig | null> {
    if (!this.repository) {
      throw new Error('ModelConfigService not initialized')
    }
    return await this.repository.findOne({ where: { isDefault: true } })
  }

  /**
   * 根据名称获取模型配置
   */
  async getConfigByName(name: string): Promise<ModelConfig | null> {
    if (!this.repository) {
      throw new Error('ModelConfigService not initialized')
    }
    return await this.repository.findOne({ where: { name } })
  }

  /**
   * 创建新的模型配置
   */
  async createConfig(configData: Partial<ModelConfig>): Promise<ModelConfig> {
    if (!this.repository) {
      throw new Error('ModelConfigService not initialized')
    }

    // 如果设置为默认配置，先取消其他默认配置
    if (configData.isDefault) {
      await this.repository.update({ isDefault: true }, { isDefault: false })
    }

    const config = this.repository.create(configData)
    return await this.repository.save(config)
  }

  /**
   * 更新模型配置
   */
  async updateConfig(id: string, configData: Partial<ModelConfig>): Promise<ModelConfig | null> {
    if (!this.repository) {
      throw new Error('ModelConfigService not initialized')
    }

    const existingConfig = await this.repository.findOne({ where: { id } })
    if (!existingConfig) {
      return null
    }

    // 如果设置为默认配置，先取消其他默认配置
    if (configData.isDefault) {
      await this.repository.update({ isDefault: true }, { isDefault: false })
    }

    await this.repository.update(id, configData)
    return await this.repository.findOne({ where: { id } })
  }

  /**
   * 删除模型配置
   */
  async deleteConfig(id: string): Promise<boolean> {
    if (!this.repository) {
      throw new Error('ModelConfigService not initialized')
    }

    const result = await this.repository.delete(id)
    return result.affected !== undefined && result.affected > 0
  }

  /**
   * 设置默认配置
   */
  async setDefaultConfig(id: string): Promise<boolean> {
    if (!this.repository) {
      throw new Error('ModelConfigService not initialized')
    }

    const config = await this.repository.findOne({ where: { id } })
    if (!config) {
      return false
    }

    // 取消其他默认配置
    await this.repository.update({ isDefault: true }, { isDefault: false })
    
    // 设置新的默认配置
    await this.repository.update(id, { isDefault: true })
    return true
  }

  /**
   * 从API配置创建数据库配置
   */
  async createFromApiConfig(apiConfig: ApiModelConfig, name: string, description?: string): Promise<ModelConfig> {
    const configData = ModelConfig.fromApiConfig(apiConfig, name, description)
    return await this.createConfig(configData)
  }

  /**
   * 获取活跃的配置列表
   */
  async getActiveConfigs(): Promise<ModelConfig[]> {
    if (!this.repository) {
      throw new Error('ModelConfigService not initialized')
    }
    return await this.repository.find({
      where: { isActive: true },
      order: { createdAt: 'DESC' }
    })
  }

  /**
   * 切换配置的活跃状态
   */
  async toggleConfigActive(id: string): Promise<boolean> {
    if (!this.repository) {
      throw new Error('ModelConfigService not initialized')
    }

    const config = await this.repository.findOne({ where: { id } })
    if (!config) {
      return false
    }

    await this.repository.update(id, { isActive: !config.isActive })
    return true
  }
}