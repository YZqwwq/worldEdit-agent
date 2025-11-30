/**
 * 将未知错误安全地规范化为可读消息字符串。
 * 保证不抛出序列化异常，并尽量提供有用信息。
 */
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

/**
 * 统一日志输出：返回消息字符串，并在控制台打印带原始对象。
 * 使用者可选择是否继续打印。
 */
export function logError(prefix: string, error: unknown): string {
  const msg = toErrorMessage(error)
  console.error(prefix, msg, error)
  return msg
}
