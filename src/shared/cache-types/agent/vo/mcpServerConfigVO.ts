/**
 * MCP服务器配置值对象
 */
export interface MCPServerConfigVO {
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
}