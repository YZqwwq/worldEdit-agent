/**
 * 工具提示词生成器
 * 根据可用工具动态生成相应的提示词内容
 */

import { Tool } from '@langchain/core/tools'

/**
 * 工具信息接口
 */
export interface ToolInfo {
  name: string
  description: string
  parameters?: Record<string, any>
}

/**
 * 工具分类
 */
export enum ToolCategory {
  FILE_OPERATIONS = 'file_operations',
  CODE_ANALYSIS = 'code_analysis',
  WEB_SEARCH = 'web_search',
  SYSTEM_COMMANDS = 'system_commands',
  MCP_TOOLS = 'mcp_tools',
  OTHER = 'other'
}

/**
 * 工具提示词生成选项
 */
export interface ToolPromptOptions {
  includeUsageGuidelines?: boolean
  includeExamples?: boolean
  includeErrorHandling?: boolean
  categorizeTools?: boolean
  maxToolsPerCategory?: number
  customInstructions?: string
}

/**
 * 工具提示词生成器类
 */
export class ToolPromptGenerator {
  private static readonly DEFAULT_OPTIONS: ToolPromptOptions = {
    includeUsageGuidelines: true,
    includeExamples: false,
    includeErrorHandling: true,
    categorizeTools: true,
    maxToolsPerCategory: 10,
    customInstructions: ''
  }

  /**
   * 生成工具提示词
   */
  static generateToolPrompt(tools: ToolInfo[], options: ToolPromptOptions = {}): string {
    const opts = { ...this.DEFAULT_OPTIONS, ...options }
    
    if (tools.length === 0) {
      return this.generateNoToolsPrompt()
    }

    let prompt = this.generateToolHeader(tools.length)
    
    if (opts.categorizeTools) {
      prompt += this.generateCategorizedToolList(tools, opts)
    } else {
      prompt += this.generateSimpleToolList(tools)
    }

    if (opts.includeUsageGuidelines) {
      prompt += this.generateUsageGuidelines()
    }

    if (opts.includeErrorHandling) {
      prompt += this.generateErrorHandlingGuidelines()
    }

    if (opts.customInstructions) {
      prompt += `\n\n## Additional Instructions\n\n${opts.customInstructions}`
    }

    return prompt
  }

  /**
   * 从LangChain工具生成提示词
   */
  static generateFromLangChainTools(tools: Tool[], options: ToolPromptOptions = {}): string {
    const toolInfos: ToolInfo[] = tools.map(tool => ({
      name: tool.name,
      description: tool.description
    }))
    
    return this.generateToolPrompt(toolInfos, options)
  }

  /**
   * 生成无工具时的提示词
   */
  private static generateNoToolsPrompt(): string {
    return `## Available Tools

Currently, no external tools are available. You should rely on your built-in capabilities to assist users.

## Guidelines

- Use your knowledge and reasoning abilities to provide helpful responses
- If a task requires external tools or real-time information, explain the limitations
- Suggest alternative approaches when possible
- Be transparent about what you can and cannot do without tools`
  }

  /**
   * 生成工具头部信息
   */
  private static generateToolHeader(toolCount: number): string {
    return `## Available Tools

You have access to ${toolCount} tool${toolCount > 1 ? 's' : ''} that can help you assist users more effectively. Use these tools when appropriate to provide better, more accurate, and more helpful responses.`
  }

  /**
   * 生成分类工具列表
   */
  private static generateCategorizedToolList(tools: ToolInfo[], options: ToolPromptOptions): string {
    const categorized = this.categorizeTools(tools)
    let result = '\n\n### Tool Categories\n'

    Object.entries(categorized).forEach(([category, categoryTools]) => {
      if (categoryTools.length === 0) return
      
      const displayTools = options.maxToolsPerCategory 
        ? categoryTools.slice(0, options.maxToolsPerCategory)
        : categoryTools
      
      result += `\n#### ${this.formatCategoryName(category as ToolCategory)}\n\n`
      
      displayTools.forEach(tool => {
        result += `- **${tool.name}**: ${tool.description}\n`
      })
      
      if (options.maxToolsPerCategory && categoryTools.length > options.maxToolsPerCategory) {
        const remaining = categoryTools.length - options.maxToolsPerCategory
        result += `- ... and ${remaining} more tool${remaining > 1 ? 's' : ''} in this category\n`
      }
    })

    return result
  }

  /**
   * 生成简单工具列表
   */
  private static generateSimpleToolList(tools: ToolInfo[]): string {
    let result = '\n\n### Available Tools\n\n'
    
    tools.forEach(tool => {
      result += `- **${tool.name}**: ${tool.description}\n`
    })
    
    return result
  }

  /**
   * 生成使用指南
   */
  private static generateUsageGuidelines(): string {
    return `\n\n## Tool Usage Guidelines

1. **Tool Selection**: Choose the most appropriate tool for each task. Consider the tool's purpose and capabilities.

2. **Parameter Preparation**: Ensure you have all required parameters before calling a tool. Ask users for missing information if needed.

3. **Error Handling**: If a tool call fails, analyze the error and try alternative approaches or tools when possible.

4. **Efficiency**: Use tools efficiently. Avoid unnecessary tool calls and prefer single calls that accomplish multiple objectives when possible.

5. **User Communication**: Explain what tools you're using and why, especially for complex operations.

6. **Fallback Strategy**: If no suitable tool is available for a task, use your built-in capabilities and clearly explain any limitations.`
  }

  /**
   * 生成错误处理指南
   */
  private static generateErrorHandlingGuidelines(): string {
    return `\n\n## Error Handling

- **Tool Failures**: If a tool call fails, analyze the error message and suggest solutions or alternatives
- **Missing Parameters**: Request missing information from users in a clear and helpful manner
- **Permission Issues**: Explain when operations require specific permissions or access rights
- **Rate Limits**: Be aware of potential rate limits and suggest appropriate timing for tool usage
- **Graceful Degradation**: When tools are unavailable, provide the best possible assistance using built-in capabilities`
  }

  /**
   * 工具分类
   */
  private static categorizeTools(tools: ToolInfo[]): Record<ToolCategory, ToolInfo[]> {
    const categories: Record<ToolCategory, ToolInfo[]> = {
      [ToolCategory.FILE_OPERATIONS]: [],
      [ToolCategory.CODE_ANALYSIS]: [],
      [ToolCategory.WEB_SEARCH]: [],
      [ToolCategory.SYSTEM_COMMANDS]: [],
      [ToolCategory.MCP_TOOLS]: [],
      [ToolCategory.OTHER]: []
    }

    tools.forEach(tool => {
      const category = this.classifyTool(tool)
      categories[category].push(tool)
    })

    return categories
  }

  /**
   * 分类单个工具
   */
  private static classifyTool(tool: ToolInfo): ToolCategory {
    const name = tool.name.toLowerCase()
    const description = tool.description.toLowerCase()

    // 文件操作
    if (name.includes('file') || name.includes('read') || name.includes('write') || 
        name.includes('create') || name.includes('delete') || name.includes('move') ||
        description.includes('file') || description.includes('directory')) {
      return ToolCategory.FILE_OPERATIONS
    }

    // 代码分析
    if (name.includes('code') || name.includes('search') || name.includes('analyze') ||
        name.includes('parse') || description.includes('code') || description.includes('search')) {
      return ToolCategory.CODE_ANALYSIS
    }

    // 网络搜索
    if (name.includes('web') || name.includes('search') || name.includes('internet') ||
        description.includes('web') || description.includes('search') || description.includes('internet')) {
      return ToolCategory.WEB_SEARCH
    }

    // 系统命令
    if (name.includes('command') || name.includes('run') || name.includes('execute') ||
        name.includes('shell') || description.includes('command') || description.includes('execute')) {
      return ToolCategory.SYSTEM_COMMANDS
    }

    // MCP工具
    if (name.includes('mcp') || description.includes('mcp') || 
        name.startsWith('run_mcp') || description.includes('mcp server')) {
      return ToolCategory.MCP_TOOLS
    }

    return ToolCategory.OTHER
  }

  /**
   * 格式化分类名称
   */
  private static formatCategoryName(category: ToolCategory): string {
    switch (category) {
      case ToolCategory.FILE_OPERATIONS:
        return 'File Operations'
      case ToolCategory.CODE_ANALYSIS:
        return 'Code Analysis & Search'
      case ToolCategory.WEB_SEARCH:
        return 'Web Search'
      case ToolCategory.SYSTEM_COMMANDS:
        return 'System Commands'
      case ToolCategory.MCP_TOOLS:
        return 'MCP Tools'
      case ToolCategory.OTHER:
        return 'Other Tools'
      default:
        return 'Unknown Category'
    }
  }

  /**
   * 生成MCP专用提示词
   */
  static generateMCPPrompt(mcpTools: ToolInfo[]): string {
    if (mcpTools.length === 0) {
      return ''
    }

    let prompt = `\n\n## MCP (Model Context Protocol) Tools

You have access to ${mcpTools.length} MCP tool${mcpTools.length > 1 ? 's' : ''} that provide extended capabilities:

`
    
    mcpTools.forEach(tool => {
      prompt += `- **${tool.name}**: ${tool.description}\n`
    })

    prompt += `\n### MCP Usage Guidelines

1. **Server Integration**: MCP tools are provided by external servers and may have specific requirements
2. **Error Handling**: MCP tools may fail due to server issues - handle gracefully and inform users
3. **Parameter Validation**: Ensure all required parameters are provided as MCP tools are strict about input validation
4. **Performance**: MCP tools may have different response times - set appropriate expectations
5. **Capabilities**: MCP tools extend your capabilities significantly - use them when they provide clear value`

    return prompt
  }

  /**
   * 生成工具使用示例
   */
  static generateToolExamples(tools: ToolInfo[]): string {
    if (tools.length === 0) return ''

    let examples = '\n\n## Tool Usage Examples\n\n'
    
    // 选择几个代表性工具生成示例
    const sampleTools = tools.slice(0, 3)
    
    sampleTools.forEach((tool, index) => {
      examples += `### Example ${index + 1}: Using ${tool.name}\n\n`
      examples += `**Scenario**: ${this.generateScenario(tool)}\n\n`
      examples += `**Approach**: ${this.generateApproach(tool)}\n\n`
    })

    return examples
  }

  /**
   * 生成工具使用场景
   */
  private static generateScenario(tool: ToolInfo): string {
    const category = this.classifyTool(tool)
    
    switch (category) {
      case ToolCategory.FILE_OPERATIONS:
        return 'User needs to read, write, or manage files'
      case ToolCategory.CODE_ANALYSIS:
        return 'User wants to search or analyze code in their project'
      case ToolCategory.WEB_SEARCH:
        return 'User needs current information not in your training data'
      case ToolCategory.SYSTEM_COMMANDS:
        return 'User wants to execute system commands or scripts'
      case ToolCategory.MCP_TOOLS:
        return 'User needs specialized functionality provided by MCP servers'
      default:
        return 'User has a specific task that requires this tool'
    }
  }

  /**
   * 生成工具使用方法
   */
  private static generateApproach(tool: ToolInfo): string {
    return `Use the ${tool.name} tool to ${tool.description.toLowerCase()}. Ensure all required parameters are provided and handle any errors gracefully.`
  }
}