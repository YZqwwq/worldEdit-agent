/**
 * 数据库工具集成
 * 为AI Agent提供数据库操作工具
 */

import type { MCPTool } from '../../types/agent'
import { mainDatabaseService } from '../database/DatabaseService'
import type { RecentFile } from '../../../shared/types/world'

/**
 * 数据库工具定义
 * 提供给AI Agent使用的数据库操作工具
 */
export const DATABASE_TOOLS: MCPTool[] = [
  {
    name: 'database_create_world',
    description: '创建新的世界观',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '世界观名称'
        },
        description: {
          type: 'string',
          description: '世界观描述'
        },
        author: {
          type: 'string',
          description: '作者名称',
          default: 'AI Agent'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '标签列表',
          default: []
        },
        version: {
          type: 'string',
          description: '版本号',
          default: '1.0.0'
        }
      },
      required: ['name', 'description']
    },
    serverName: 'database',
    enabled: true
  },
  {
    name: 'database_get_world_list',
    description: '获取所有世界观列表',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    serverName: 'database',
    enabled: true
  },
  {
    name: 'database_get_world',
    description: '根据ID获取世界观基础信息',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '世界观ID'
        }
      },
      required: ['id']
    },
    serverName: 'database',
    enabled: true
  },
  {
    name: 'database_get_world_content',
    description: '根据ID获取完整的世界观内容',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '世界观ID'
        }
      },
      required: ['id']
    },
    serverName: 'database',
    enabled: true
  },
  {
    name: 'database_update_world',
    description: '更新世界观基础信息',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '世界观ID'
        },
        updates: {
          type: 'object',
          description: '要更新的字段',
          properties: {
            name: { type: 'string', description: '世界观名称' },
            description: { type: 'string', description: '世界观描述' },
            author: { type: 'string', description: '作者名称' },
            tags: { type: 'array', items: { type: 'string' }, description: '标签列表' },
            version: { type: 'string', description: '版本号' }
          }
        }
      },
      required: ['id', 'updates']
    },
    serverName: 'database',
    enabled: true
  },
  {
    name: 'database_save_world_content',
    description: '保存完整的世界观内容',
    inputSchema: {
      type: 'object',
      properties: {
        worldContent: {
          type: 'object',
          description: '完整的世界观内容对象',
          properties: {
            id: { type: 'string', description: '世界观ID' },
            name: { type: 'string', description: '世界观名称' },
            description: { type: 'string', description: '世界观描述' },
            geography: { type: 'object', description: '地理信息' },
            nations: { type: 'array', description: '国家列表' },
            factions: { type: 'array', description: '势力列表' },
            powerSystems: { type: 'array', description: '力量体系列表' },
            characters: { type: 'array', description: '角色列表' },
            maps: { type: 'array', description: '地图列表' },
            relationships: { type: 'array', description: '关系列表' }
          },
          required: ['id', 'name']
        }
      },
      required: ['worldContent']
    },
    serverName: 'database',
    enabled: true
  },
  {
    name: 'database_delete_world',
    description: '删除世界观及其所有相关数据',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: '要删除的世界观ID'
        }
      },
      required: ['id']
    },
    serverName: 'database',
    enabled: true
  },
  {
    name: 'database_search_worlds',
    description: '搜索世界观',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词'
        }
      },
      required: ['query']
    },
    serverName: 'database',
    enabled: true
  },
  {
    name: 'database_get_recent_files',
    description: '获取最近使用的文件列表',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    serverName: 'database',
    enabled: true
  },
  {
    name: 'database_add_recent_file',
    description: '添加最近使用的文件',
    inputSchema: {
      type: 'object',
      properties: {
        file: {
          type: 'object',
          description: '文件信息',
          properties: {
            id: { type: 'string', description: '文件ID' },
            name: { type: 'string', description: '文件名称' },
            path: { type: 'string', description: '文件路径' },
            type: { type: 'string', description: '文件类型' },
            lastOpened: { type: 'string', description: 'ISO格式的最后打开时间' }
          },
          required: ['id', 'name', 'path', 'type']
        }
      },
      required: ['file']
    },
    serverName: 'database',
    enabled: true
  },
  {
    name: 'database_export_data',
    description: '导出所有数据库数据',
    inputSchema: {
      type: 'object',
      properties: {}
    },
    serverName: 'database',
    enabled: true
  },
  {
    name: 'database_import_data',
    description: '导入数据库数据',
    inputSchema: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          description: '要导入的数据对象'
        }
      },
      required: ['data']
    },
    serverName: 'database',
    enabled: true
  }
]

/**
 * 数据库工具执行器
 * 处理AI Agent对数据库工具的调用
 */
export class DatabaseToolExecutor {
  /**
   * 执行数据库工具
   */
  static async executeTool(toolName: string, input: any): Promise<any> {
    try {
      switch (toolName) {
        case 'database_create_world':
          return await mainDatabaseService.createWorld({
            name: input.name,
            description: input.description,
            author: input.author || 'AI Agent',
            tags: input.tags || [],
            version: input.version || '1.0.0',
            lastModified: new Date()
          })

        case 'database_get_world_list':
          return await mainDatabaseService.getWorldList()

        case 'database_get_world':
          const world = await mainDatabaseService.getWorld(input.id)
          if (!world) {
            throw new Error(`未找到ID为 ${input.id} 的世界观`)
          }
          return world

        case 'database_get_world_content':
          const content = await mainDatabaseService.getWorldContent(input.id)
          if (!content) {
            throw new Error(`未找到ID为 ${input.id} 的世界观内容`)
          }
          return content

        case 'database_update_world':
          await mainDatabaseService.updateWorld(input.id, input.updates)
          return { success: true, message: '世界观更新成功' }

        case 'database_save_world_content':
          await mainDatabaseService.saveWorldContent(input.worldContent)
          return { success: true, message: '世界观内容保存成功' }

        case 'database_delete_world':
          await mainDatabaseService.deleteWorld(input.id)
          return { success: true, message: '世界观删除成功' }

        case 'database_search_worlds':
          return await mainDatabaseService.searchWorlds(input.query)

        case 'database_get_recent_files':
          return await mainDatabaseService.getRecentFiles()

        case 'database_add_recent_file':
          // 处理日期字段
          const fileData: RecentFile = {
            ...input.file,
            lastOpened: input.file.lastOpened ? new Date(input.file.lastOpened) : new Date()
          }
          await mainDatabaseService.addRecentFile(fileData)
          return { success: true, message: '最近文件添加成功' }

        case 'database_export_data':
          return await mainDatabaseService.exportData()

        case 'database_import_data':
          await mainDatabaseService.importData(input.data)
          return { success: true, message: '数据导入成功' }

        default:
          throw new Error(`未知的数据库工具: ${toolName}`)
      }
    } catch (error) {
      console.error(`数据库工具执行失败 [${toolName}]:`, error)
      throw error
    }
  }

  /**
   * 获取工具描述信息
   */
  static getToolDescription(toolName: string): string {
    const tool = DATABASE_TOOLS.find(t => t.name === toolName)
    return tool ? tool.description : '未知工具'
  }

  /**
   * 验证工具输入参数
   */
  static validateInput(toolName: string, input: any): void {
    const tool = DATABASE_TOOLS.find(t => t.name === toolName)
    if (!tool) {
      throw new Error(`未知的数据库工具: ${toolName}`)
    }

    // 检查必需参数
    if (tool.inputSchema.required) {
      for (const requiredField of tool.inputSchema.required) {
        if (!(requiredField in input)) {
          throw new Error(`缺少必需参数: ${requiredField}`)
        }
      }
    }
  }
}