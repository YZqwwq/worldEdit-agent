/**
 * MCP工具调用管理器
 * 负责MCP工具的注册、调用和生命周期管理
 */

import { Tool } from '@langchain/core/tools'
import { z } from 'zod'
import type {
  MCPTool,
  MCPServerConfig,
  ToolCall
} from '../../types/agent'

/**
 * MCP工具实现类
 * 继承Langchain的Tool基类，用于集成到Agent中
 */
class MCPToolImplementation extends Tool {
  name: string
  description: string
  schema: any
  private mcpTool: MCPTool
  private manager: MCPToolManager

  constructor(mcpTool: MCPTool, manager: MCPToolManager) {
    super()
    this.name = mcpTool.name
    this.description = mcpTool.description
    this.schema = this.createSchema(mcpTool.inputSchema)
    this.mcpTool = mcpTool
    this.manager = manager
  }

  async _call(input: any): Promise<string> {
    try {
      const result = await this.manager.callTool(this.mcpTool.name, input)
      return typeof result === 'string' ? result : JSON.stringify(result)
    } catch (error) {
      throw new Error(`MCP工具调用失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  private createSchema(_inputSchema: any): any {
    // 创建符合Langchain Tool要求的ZodEffects schema
    // 将输入参数序列化为JSON字符串
    return z.object({
      input: z.string().optional().describe('工具输入参数的JSON字符串')
    }).transform((data) => {
      if (!data.input) return undefined
      try {
        return JSON.parse(data.input)
      } catch {
        return data.input
      }
    })
  }
}

/**
 * MCP工具调用管理器类
 */
export class MCPToolManager {
  private tools: Map<string, MCPTool> = new Map()
  private servers: Map<string, MCPServerConfig> = new Map()
  private toolInstances: Map<string, MCPToolImplementation> = new Map()
  private isInitialized = false

  /**
   * 初始化MCP工具管理器
   */
  async initialize(): Promise<void> {
    try {
      // 加载默认工具配置
      await this.loadDefaultTools()
      
      this.isInitialized = true
      console.log('MCP工具管理器初始化完成')
    } catch (error) {
      console.error('MCP工具管理器初始化失败:', error)
      throw error
    }
  }

  /**
   * 注册MCP服务器
   */
  async registerServer(config: MCPServerConfig): Promise<void> {
    try {
      this.servers.set(config.name, config)
      
      // 加载服务器提供的工具
      await this.loadServerTools(config)
      
      console.log(`MCP服务器 ${config.name} 注册成功`)
    } catch (error) {
      console.error(`注册MCP服务器失败: ${config.name}`, error)
      throw error
    }
  }

  /**
   * 注册单个工具
   */
  registerTool(tool: MCPTool): void {
    this.tools.set(tool.name, tool)
    
    // 创建工具实例
    const toolInstance = new MCPToolImplementation(tool, this)
    this.toolInstances.set(tool.name, toolInstance)
    
    console.log(`MCP工具 ${tool.name} 注册成功`)
  }

  /**
   * 获取所有可用工具
   */
  getAvailableTools(): Tool[] {
    return Array.from(this.toolInstances.values())
  }

  /**
   * 获取工具信息
   */
  getToolInfo(toolName: string): MCPTool | null {
    return this.tools.get(toolName) || null
  }

  /**
   * 获取所有工具信息
   */
  getAllToolsInfo(): MCPTool[] {
    return Array.from(this.tools.values())
  }

  /**
   * 调用工具
   */
  async callTool(toolName: string, input: any): Promise<any> {
    const tool = this.tools.get(toolName)
    if (!tool) {
      throw new Error(`工具不存在: ${toolName}`)
    }

    try {
      // 验证输入参数
      this.validateInput(tool, input)
      
      // 模拟工具调用（实际实现中需要调用真实的MCP服务器）
      const result = await this.executeTool(tool, input)
      
      return result
    } catch (error) {
      console.error(`工具调用失败: ${toolName}`, error)
      throw error
    }
  }

  /**
   * 移除工具
   */
  removeTool(toolName: string): boolean {
    const removed = this.tools.delete(toolName)
    this.toolInstances.delete(toolName)
    return removed
  }

  /**
   * 移除服务器及其所有工具
   */
  removeServer(serverName: string): boolean {
    const server = this.servers.get(serverName)
    if (!server) {
      return false
    }

    // 移除服务器提供的所有工具
    for (const tool of Array.from(this.tools.values())) {
      if (tool.serverName === serverName) {
        this.removeTool(tool.name)
      }
    }

    return this.servers.delete(serverName)
  }

  /**
   * 获取工具调用历史
   */
  getToolCallHistory(): ToolCall[] {
    // 这里应该返回实际的调用历史
    // 当前返回空数组，实际实现中需要记录调用历史
    return []
  }

  /**
   * 清空所有工具
   */
  clearAllTools(): void {
    this.tools.clear()
    this.toolInstances.clear()
    this.servers.clear()
  }

  /**
   * 检查工具是否可用
   */
  isToolAvailable(toolName: string): boolean {
    return this.tools.has(toolName)
  }

  /**
   * 获取服务器状态
   */
  getServerStatus(serverName: string): 'connected' | 'disconnected' | 'error' | 'unknown' {
    const server = this.servers.get(serverName)
    if (!server) {
      return 'unknown'
    }
    
    // 实际实现中应该检查真实的连接状态
    return 'connected'
  }

  /**
   * 加载默认工具
   */
  private async loadDefaultTools(): Promise<void> {
    // 注册一些基础工具
    const defaultTools: MCPTool[] = [
      {
        name: 'get_current_time',
        description: '获取当前时间',
        inputSchema: {
          type: 'object',
          properties: {
            format: {
              type: 'string',
              description: '时间格式，如 "YYYY-MM-DD HH:mm:ss"',
              default: 'YYYY-MM-DD HH:mm:ss'
            }
          }
        },
        serverName: 'system',
        enabled: true
      },
      {
        name: 'calculate',
        description: '执行数学计算',
        inputSchema: {
          type: 'object',
          properties: {
            expression: {
              type: 'string',
              description: '数学表达式，如 "2 + 3 * 4"'
            }
          },
          required: ['expression']
        },
        serverName: 'system',
        enabled: true
      }
    ]

    for (const tool of defaultTools) {
      this.registerTool(tool)
    }
  }

  /**
   * 加载服务器工具
   */
  private async loadServerTools(config: MCPServerConfig): Promise<void> {
    // 实际实现中应该连接到MCP服务器并获取工具列表
    // 这里是模拟实现
    console.log(`正在加载服务器 ${config.name} 的工具...`)
    
    // 模拟从服务器获取工具列表
    const mockTools: MCPTool[] = [
      {
        name: `${config.name}_tool_1`,
        description: `来自 ${config.name} 的示例工具`,
        inputSchema: {
          type: 'object',
          properties: {
            input: {
              type: 'string',
              description: '输入参数'
            }
          },
          required: ['input']
        },
        serverName: config.name,
        enabled: true
      }
    ]

    for (const tool of mockTools) {
      this.registerTool(tool)
    }
  }

  /**
   * 验证输入参数
   */
  private validateInput(tool: MCPTool, input: any): void {
    // 简单的参数验证
    if (tool.inputSchema.required) {
      for (const requiredField of tool.inputSchema.required) {
        if (!(requiredField in input)) {
          throw new Error(`缺少必需参数: ${requiredField}`)
        }
      }
    }
  }

  /**
   * 执行工具
   */
  private async executeTool(tool: MCPTool, input: any): Promise<any> {
    // 实际实现中应该调用真实的MCP服务器
    // 这里是模拟实现
    switch (tool.name) {
      case 'get_current_time':
        const format = input.format || 'YYYY-MM-DD HH:mm:ss'
        const now = new Date()
        return this.formatDate(now, format)
        
      case 'calculate':
        try {
          // 注意：实际应用中不应该使用eval，这里仅作演示
          // 应该使用安全的数学表达式解析器
          const result = Function(`"use strict"; return (${input.expression})`)()
          return `计算结果: ${result}`
        } catch (error) {
          throw new Error(`计算错误: ${error instanceof Error ? error.message : '未知错误'}`)
        }
        
      default:
        return `工具 ${tool.name} 执行完成，输入参数: ${JSON.stringify(input)}`
    }
  }

  /**
   * 格式化日期
   */
  private formatDate(date: Date, format: string): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')

    return format
      .replace('YYYY', String(year))
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds)
  }

  /**
   * 获取初始化状态
   */
  isReady(): boolean {
    return this.isInitialized
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    this.clearAllTools()
    this.isInitialized = false
  }
}