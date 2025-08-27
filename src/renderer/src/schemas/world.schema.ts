import Ajv, { JSONSchemaType } from 'ajv'
import type { WorldData, UnifiedWorldData, CharacterData, MapData } from '../types/world'

// 基础元数据Schema
const baseMetadataSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    version: { type: 'string' }
  },
  required: ['id', 'name', 'createdAt', 'updatedAt', 'version']
} as const

// 世界观基础数据Schema
export const worldDataSchema: JSONSchemaType<WorldData> = {
  type: 'object',
  properties: {
    ...baseMetadataSchema.properties,
    description: { type: 'string' },
    thumbnail: { type: 'string', nullable: true },
    tags: {
      type: 'array',
      items: { type: 'string' }
    },
    author: { type: 'string' },
    lastModified: { type: 'string', format: 'date-time' }
  },
  required: [...baseMetadataSchema.required, 'description', 'tags', 'author', 'lastModified'],
  additionalProperties: false
}

// 地理数据Schema
const geographyDataSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    type: {
      type: 'string',
      enum: ['continent', 'country', 'region', 'city', 'landmark']
    },
    description: { type: 'string' },
    parentId: { type: 'string', nullable: true },
    coordinates: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' }
      },
      required: ['x', 'y'],
      nullable: true
    },
    climate: { type: 'string', nullable: true },
    resources: {
      type: 'array',
      items: { type: 'string' },
      nullable: true
    }
  },
  required: ['id', 'name', 'type', 'description']
} as const

// 国家数据Schema
const nationDataSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    government: { type: 'string' },
    culture: { type: 'string' },
    economy: { type: 'string' },
    military: { type: 'string' },
    territories: {
      type: 'array',
      items: { type: 'string' }
    },
    relationships: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          sourceId: { type: 'string' },
          targetId: { type: 'string' },
          type: { type: 'string' },
          description: { type: 'string' },
          strength: { type: 'number' },
          isPublic: { type: 'boolean' }
        },
        required: ['id', 'sourceId', 'targetId', 'type', 'description', 'strength', 'isPublic']
      }
    }
  },
  required: ['id', 'name', 'description', 'government', 'culture', 'economy', 'military', 'territories', 'relationships']
} as const

// 势力数据Schema
const factionDataSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    type: {
      type: 'string',
      enum: ['political', 'military', 'religious', 'economic', 'secret']
    },
    description: { type: 'string' },
    goals: {
      type: 'array',
      items: { type: 'string' }
    },
    resources: {
      type: 'array',
      items: { type: 'string' }
    },
    influence: { type: 'number' },
    territories: {
      type: 'array',
      items: { type: 'string' },
      nullable: true
    },
    members: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  required: ['id', 'name', 'type', 'description', 'goals', 'resources', 'influence', 'members']
} as const

// 武力体系Schema
const powerSystemDataSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    type: {
      type: 'string',
      enum: ['magic', 'technology', 'martial', 'divine', 'other']
    },
    description: { type: 'string' },
    levels: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          level: { type: 'number' },
          name: { type: 'string' },
          description: { type: 'string' },
          abilities: {
            type: 'array',
            items: { type: 'string' }
          },
          requirements: {
            type: 'array',
            items: { type: 'string' }
          }
        },
        required: ['level', 'name', 'description', 'abilities', 'requirements']
      }
    },
    rules: {
      type: 'array',
      items: { type: 'string' }
    },
    limitations: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  required: ['id', 'name', 'type', 'description', 'levels', 'rules', 'limitations']
} as const

// 时间线事件Schema
const timelineEventSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    date: { type: 'string' },
    title: { type: 'string' },
    description: { type: 'string' },
    type: {
      type: 'string',
      enum: ['political', 'military', 'cultural', 'natural', 'other']
    },
    importance: { type: 'number' },
    relatedEntities: {
      type: 'object',
      properties: {
        characters: {
          type: 'array',
          items: { type: 'string' }
        },
        locations: {
          type: 'array',
          items: { type: 'string' }
        },
        factions: {
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: ['characters', 'locations', 'factions']
    }
  },
  required: ['id', 'date', 'title', 'description', 'type', 'importance', 'relatedEntities']
} as const

// 统一世界观数据Schema
export const unifiedWorldDataSchema: JSONSchemaType<UnifiedWorldData> = {
  type: 'object',
  properties: {
    ...baseMetadataSchema.properties,
    description: { type: 'string' },
    thumbnail: { type: 'string', nullable: true },
    tags: {
      type: 'array',
      items: { type: 'string' }
    },
    author: { type: 'string' },
    lastModified: { type: 'string', format: 'date-time' },
    geography: {
      type: 'array',
      items: geographyDataSchema
    },
    nations: {
      type: 'array',
      items: nationDataSchema
    },
    factions: {
      type: 'array',
      items: factionDataSchema
    },
    powerSystems: {
      type: 'array',
      items: powerSystemDataSchema
    },
    timeline: {
      type: 'array',
      items: timelineEventSchema
    },
    characters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ...baseMetadataSchema.properties,
          portrait: {
            type: 'object',
            properties: {
              imageData: { type: 'string' },
              layers: { type: 'array', items: {} },
              metadata: {
                type: 'object',
                properties: {
                  width: { type: 'number' },
                  height: { type: 'number' },
                  format: { type: 'string' },
                  size: { type: 'number' },
                  createdAt: { type: 'string', format: 'date-time' }
                },
                required: ['width', 'height', 'format', 'size', 'createdAt']
              }
            },
            required: ['imageData', 'layers', 'metadata'],
            nullable: true
          },
          description: {
            type: 'object',
            properties: {
              appearance: { type: 'string' },
              personality: { type: 'string' },
              background: { type: 'string' },
              abilities: { type: 'array', items: {} }
            },
            required: ['appearance', 'personality', 'background', 'abilities']
          },
          relationships: { type: 'array', items: {} },
          timeline: { type: 'array', items: {} },
          factionId: { type: 'string', nullable: true },
          powerLevel: {
            type: 'object',
            properties: {
              systemId: { type: 'string' },
              level: { type: 'number' },
              abilities: {
                type: 'array',
                items: { type: 'string' }
              }
            },
            required: ['systemId', 'level', 'abilities'],
            nullable: true
          }
        },
        required: [...baseMetadataSchema.required, 'description', 'relationships', 'timeline']
      }
    },
    maps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ...baseMetadataSchema.properties,
          dimensions: {
            type: 'object',
            properties: {
              width: { type: 'number' },
              height: { type: 'number' }
            },
            required: ['width', 'height']
          },
          layers: { type: 'object', properties: {}, required: [] },
          landmarks: { type: 'array', items: {} },
          regions: { type: 'array', items: {} },
          routes: { type: 'array', items: {} },
          scale: { type: 'number' },
          projection: { type: 'string' }
        },
        required: [...baseMetadataSchema.required, 'dimensions', 'layers', 'landmarks', 'regions', 'routes', 'scale', 'projection']
      }
    },
    relationships: {
      type: 'object',
      properties: {
        textToCharacter: { type: 'array', items: {} },
        textToMap: { type: 'array', items: {} },
        characterToMap: { type: 'array', items: {} },
        crossReferences: { type: 'array', items: {} }
      },
      required: ['textToCharacter', 'textToMap', 'characterToMap', 'crossReferences']
    },
    analysis: {
      type: 'object',
      properties: {
        lastAnalyzed: { type: 'string', format: 'date-time' },
        consistency: { type: 'object', properties: {}, required: [] },
        suggestions: { type: 'array', items: {} },
        insights: { type: 'array', items: {} }
      },
      required: ['lastAnalyzed', 'consistency', 'suggestions', 'insights'],
      nullable: true
    }
  },
  required: [...baseMetadataSchema.required, 'description', 'tags', 'author', 'lastModified', 'geography', 'nations', 'factions', 'powerSystems', 'timeline', 'characters', 'maps', 'relationships'],
  additionalProperties: false
}

// Schema验证器
export class SchemaValidator {
  private ajv: Ajv

  constructor() {
    // 配置AJV以避免CSP问题 - 使用简化配置
    this.ajv = new Ajv({ 
      allErrors: true,
      strict: false,
      validateFormats: false,
      addUsedSchema: false,
      removeAdditional: false
    })
    // 不使用addFormats以避免复杂的格式验证
  }

  validateWorldData(data: any): { valid: boolean; errors?: string[] } {
    const validate = this.ajv.compile(worldDataSchema)
    const valid = validate(data)
    
    if (!valid && validate.errors) {
      return {
        valid: false,
        errors: validate.errors.map(err => `${err.instancePath}: ${err.message}`)
      }
    }
    
    return { valid: true }
  }

  validateUnifiedWorldData(data: any): { valid: boolean; errors?: string[] } {
    const validate = this.ajv.compile(unifiedWorldDataSchema)
    const valid = validate(data)
    
    if (!valid && validate.errors) {
      return {
        valid: false,
        errors: validate.errors.map(err => `${err.instancePath}: ${err.message}`)
      }
    }
    
    return { valid: true }
  }

  // 数据清理和标准化
  normalizeWorldData(data: any): WorldData {
    // 确保日期字段是正确的格式
    const normalizeDate = (date: any): Date => {
      if (date instanceof Date) return date
      if (typeof date === 'string') return new Date(date)
      return new Date()
    }

    return {
      ...data,
      createdAt: normalizeDate(data.createdAt),
      updatedAt: normalizeDate(data.updatedAt),
      lastModified: normalizeDate(data.lastModified),
      tags: Array.isArray(data.tags) ? data.tags : [],
      version: data.version || '1.0.0'
    }
  }

  normalizeUnifiedWorldData(data: any): UnifiedWorldData {
    const normalizeDate = (date: any): Date => {
      if (date instanceof Date) return date
      if (typeof date === 'string') return new Date(date)
      return new Date()
    }

    return {
      ...data,
      createdAt: normalizeDate(data.createdAt),
      updatedAt: normalizeDate(data.updatedAt),
      version: data.version || '1.0.0',
      text: {
        geography: data.text?.geography || [],
        nations: data.text?.nations || [],
        factions: data.text?.factions || [],
        powerSystems: data.text?.powerSystems || [],
        timeline: data.text?.timeline || []
      },
      characters: data.characters || [],
      maps: data.maps || [],
      relationships: {
        textToCharacter: data.relationships?.textToCharacter || [],
        textToMap: data.relationships?.textToMap || [],
        characterToMap: data.relationships?.characterToMap || [],
        crossReferences: data.relationships?.crossReferences || []
      }
    }
  }
}

// 导出验证器实例
export const schemaValidator = new SchemaValidator()