/**
 * 工具调用值对象
 */
export interface ToolCallVO {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}