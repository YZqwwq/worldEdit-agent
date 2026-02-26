
// 代理响应元数据
export interface ProxyResponseMetadata {
  output?: Array<{
    type: string
    name: string
    arguments: string | object
    call_id?: string
    id?: string
  }>
  [key: string]: any
}
