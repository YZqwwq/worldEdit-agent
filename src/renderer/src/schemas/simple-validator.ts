import { World, WorldContent } from '../../../shared/entities'

// 为了兼容性，定义类型别名
type WorldData = World
type UnifiedWorldData = WorldContent
type CharacterData = any // 暂时使用any，后续可以定义具体的Character实体
type MapData = any // 暂时使用any，后续可以定义具体的Map实体

/**
 * 简单的数据验证器
 * 避免使用AJV以解决CSP问题
 */
export class SimpleValidator {
  /**
   * 验证WorldData
   */
  validateWorldData(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!data || typeof data !== 'object') {
      errors.push('数据必须是对象')
      return { valid: false, errors }
    }

    // 必需字段验证
    if (!data.id || typeof data.id !== 'string') {
      errors.push('id字段是必需的且必须是字符串')
    }

    if (!data.name || typeof data.name !== 'string') {
      errors.push('name字段是必需的且必须是字符串')
    }

    if (!data.description || typeof data.description !== 'string') {
      errors.push('description字段是必需的且必须是字符串')
    }

    if (!data.author || typeof data.author !== 'string') {
      errors.push('author字段是必需的且必须是字符串')
    }

    if (!data.version || typeof data.version !== 'string') {
      errors.push('version字段是必需的且必须是字符串')
    }

    // 可选字段验证
    if (data.tags && !Array.isArray(data.tags)) {
      errors.push('tags字段必须是数组')
    }

    if (data.tags && Array.isArray(data.tags)) {
      data.tags.forEach((tag: any, index: number) => {
        if (typeof tag !== 'string') {
          errors.push(`tags[${index}]必须是字符串`)
        }
      })
    }

    // 日期字段验证
    const dateFields = ['lastModified', 'createdAt', 'updatedAt']
    dateFields.forEach(field => {
      if (data[field] && !(data[field] instanceof Date) && typeof data[field] !== 'string') {
        errors.push(`${field}字段必须是Date对象或字符串`)
      }
    })

    return { valid: errors.length === 0, errors }
  }

  /**
   * 验证UnifiedWorldData
   */
  validateUnifiedWorldData(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    // 首先验证基础WorldData
    const baseValidation = this.validateWorldData(data)
    errors.push(...baseValidation.errors)

    if (!data || typeof data !== 'object') {
      return { valid: false, errors }
    }

    // 验证世界观内容字段
    const contentFields = ['geography', 'nations', 'factions', 'powerSystems', 'timeline']
    contentFields.forEach(field => {
      if (data[field] !== undefined && !Array.isArray(data[field])) {
        errors.push(`${field}字段必须是数组`)
      }
    })

    // 验证characters字段
    if (!Array.isArray(data.characters)) {
      errors.push('characters字段必须是数组')
    }

    // 验证maps字段
    if (!Array.isArray(data.maps)) {
      errors.push('maps字段必须是数组')
    }

    // 验证relationships字段
    if (!data.relationships || typeof data.relationships !== 'object') {
      errors.push('relationships字段是必需的且必须是对象')
    } else {
      const relationshipFields = ['textToCharacter', 'textToMap', 'characterToMap', 'crossReferences']
      relationshipFields.forEach(field => {
        if (!Array.isArray(data.relationships[field])) {
          errors.push(`relationships.${field}字段必须是数组`)
        }
      })
    }

    return { valid: errors.length === 0, errors }
  }

  /**
   * 验证CharacterData
   */
  validateCharacterData(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!data || typeof data !== 'object') {
      errors.push('数据必须是对象')
      return { valid: false, errors }
    }

    // 必需字段验证
    if (!data.id || typeof data.id !== 'string') {
      errors.push('id字段是必需的且必须是字符串')
    }

    if (!data.name || typeof data.name !== 'string') {
      errors.push('name字段是必需的且必须是字符串')
    }

    if (!data.worldId || typeof data.worldId !== 'string') {
      errors.push('worldId字段是必需的且必须是字符串')
    }

    // 可选字段验证
    if (data.description && typeof data.description !== 'string') {
      errors.push('description字段必须是字符串')
    }

    if (data.tags && !Array.isArray(data.tags)) {
      errors.push('tags字段必须是数组')
    }

    return { valid: errors.length === 0, errors }
  }

  /**
   * 验证MapData
   */
  validateMapData(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!data || typeof data !== 'object') {
      errors.push('数据必须是对象')
      return { valid: false, errors }
    }

    // 必需字段验证
    if (!data.id || typeof data.id !== 'string') {
      errors.push('id字段是必需的且必须是字符串')
    }

    if (!data.name || typeof data.name !== 'string') {
      errors.push('name字段是必需的且必须是字符串')
    }

    if (!data.worldId || typeof data.worldId !== 'string') {
      errors.push('worldId字段是必需的且必须是字符串')
    }

    // 可选字段验证
    if (data.description && typeof data.description !== 'string') {
      errors.push('description字段必须是字符串')
    }

    if (data.tags && !Array.isArray(data.tags)) {
      errors.push('tags字段必须是数组')
    }

    return { valid: errors.length === 0, errors }
  }

  /**
   * 规范化WorldData
   */
  normalizeWorldData(data: any): WorldData {
    const now = new Date()
    
    // 辅助函数：将字符串或Date对象转换为Date对象
    const parseDate = (value: any): Date => {
      if (value instanceof Date) {
        return value
      }
      if (typeof value === 'string') {
        const parsed = new Date(value)
        return isNaN(parsed.getTime()) ? now : parsed
      }
      return now
    }
    
    return {
      id: data.id || '',
      name: data.name || '未命名世界观',
      description: data.description || '',
      tags: Array.isArray(data.tags) ? data.tags : [],
      author: data.author || '未知作者',
      lastModified: parseDate(data.lastModified),
      createdAt: parseDate(data.createdAt),
      updatedAt: parseDate(data.updatedAt),
      version: data.version || '1.0.0'
    }
  }

  /**
   * 规范化UnifiedWorldData
   */
  normalizeUnifiedWorldData(data: any): UnifiedWorldData {
    const baseData = this.normalizeWorldData(data)
    
    return {
      ...baseData,
      geography: Array.isArray(data.geography) ? data.geography : (Array.isArray(data.text?.geography) ? data.text.geography : []),
      nations: Array.isArray(data.nations) ? data.nations : (Array.isArray(data.text?.nations) ? data.text.nations : []),
      factions: Array.isArray(data.factions) ? data.factions : (Array.isArray(data.text?.factions) ? data.text.factions : []),
      powerSystems: Array.isArray(data.powerSystems) ? data.powerSystems : (Array.isArray(data.text?.powerSystems) ? data.text.powerSystems : []),
      timeline: Array.isArray(data.timeline) ? data.timeline : (Array.isArray(data.text?.timeline) ? data.text.timeline : []),
      characters: Array.isArray(data.characters) ? data.characters : [],
      maps: Array.isArray(data.maps) ? data.maps : [],
      relationships: Array.isArray(data.relationships) ? data.relationships : []
    }
  }

  /**
   * 规范化CharacterData
   */
  normalizeCharacterData(data: any): CharacterData {
    const now = new Date()
    
    // 辅助函数：将字符串或Date对象转换为Date对象
    const parseDate = (value: any): Date => {
      if (value instanceof Date) {
        return value
      }
      if (typeof value === 'string') {
        const parsed = new Date(value)
        return isNaN(parsed.getTime()) ? now : parsed
      }
      return now
    }
    
    return {
      id: data.id || '',
      name: data.name || '未命名角色',
      version: data.version || '1.0.0',
      createdAt: parseDate(data.createdAt),
      updatedAt: parseDate(data.updatedAt),
      portrait: data.portrait || undefined,
      description: {
        appearance: data.appearance || data.description?.appearance || '',
        personality: data.personality || data.description?.personality || '',
        background: data.background || data.description?.background || '',
        abilities: Array.isArray(data.abilities) ? data.abilities : (Array.isArray(data.description?.abilities) ? data.description.abilities : [])
      },
      relationships: Array.isArray(data.relationships) ? data.relationships : [],
      timeline: Array.isArray(data.timeline) ? data.timeline : [],
      factionId: data.factionId || undefined,
      powerLevel: data.powerLevel || undefined
    }
  }

  /**
   * 规范化MapData
   */
  normalizeMapData(data: any): MapData {
    const now = new Date()
    
    // 辅助函数：将字符串或Date对象转换为Date对象
    const parseDate = (value: any): Date => {
      if (value instanceof Date) {
        return value
      }
      if (typeof value === 'string') {
        const parsed = new Date(value)
        return isNaN(parsed.getTime()) ? now : parsed
      }
      return now
    }
    
    return {
      id: data.id || '',
      name: data.name || '未命名地图',
      type: data.type || 'region',
      scale: typeof data.scale === 'number' ? data.scale : 1,
      projection: data.projection || 'mercator',
      dimensions: {
        width: typeof data.dimensions?.width === 'number' ? data.dimensions.width : 0,
        height: typeof data.dimensions?.height === 'number' ? data.dimensions.height : 0
      },
      layers: {
        pixel: Array.isArray(data.layers?.pixel)? data.layers.pixel : [],
        vector: Array.isArray(data.layers?.vector) ? data.layers.vector : []
      },
      landmarks: Array.isArray(data.landmarks) ? data.landmarks : [],
      regions: Array.isArray(data.regions) ? data.regions : [],
      routes: Array.isArray(data.routes) ? data.routes : [],
      createdAt: parseDate(data.createdAt),
      updatedAt: parseDate(data.updatedAt)
    }
  }
}

// 导出验证器实例
export const simpleValidator = new SimpleValidator()