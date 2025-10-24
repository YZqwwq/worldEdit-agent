/**
 * Agent Mappers 统一导出
 * 提供所有agent相关的数据转换器
 */

// 导出所有Mapper类
export { AgentConfigMapper } from './AgentConfigMapper';
export { AgentStateMapper } from './AgentStateMapper';
export { TokenUsageMapper, type ExtendedTokenUsageVO } from './TokenUsageMapper';
export { ToolCallMapper, type ExtendedToolCallVO } from './ToolCallMapper';

// 导出现有的Chat相关Mapper（如果需要在agent上下文中使用）
export { ChatMessageMapper } from './ChatMessageMapper';
export { ChatSessionMapper } from './ChatSessionMapper';

/**
 * Mapper工具函数
 */
export class MapperUtils {
  /**
   * 安全的JSON解析
   */
  static safeJsonParse<T = any>(jsonString: string | null | undefined, defaultValue: T): T {
    if (!jsonString) return defaultValue;
    try {
      return JSON.parse(jsonString);
    } catch {
      return defaultValue;
    }
  }

  /**
   * 安全的JSON字符串化
   */
  static safeJsonStringify(obj: any): string {
    try {
      return JSON.stringify(obj);
    } catch {
      return '{}';
    }
  }

  /**
   * 安全的日期转换
   */
  static safeToISOString(date: Date | string | null | undefined): string | undefined {
    if (!date) return undefined;
    try {
      return new Date(date).toISOString();
    } catch {
      return undefined;
    }
  }

  /**
   * 安全的日期解析
   */
  static safeParseDate(dateString: string | null | undefined): Date | undefined {
    if (!dateString) return undefined;
    try {
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? undefined : date;
    } catch {
      return undefined;
    }
  }

  /**
   * 深度合并对象（用于metadata等字段）
   */
  static deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
    const result = { ...target };
    
    for (const key in source) {
      const sourceValue = source[key];
      const targetValue = result[key];
      
      if (sourceValue !== undefined) {
        if (
          typeof sourceValue === 'object' && 
          sourceValue !== null && 
          !Array.isArray(sourceValue) &&
          typeof targetValue === 'object' && 
          targetValue !== null && 
          !Array.isArray(targetValue)
        ) {
          result[key] = this.deepMerge(targetValue, sourceValue);
        } else {
          result[key] = sourceValue;
        }
      }
    }
    
    return result;
  }

  /**
   * 清理undefined字段
   */
  static cleanUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
    const result: Partial<T> = {};
    
    for (const key in obj) {
      if (obj[key] !== undefined) {
        result[key] = obj[key];
      }
    }
    
    return result;
  }
}

/**
 * 批量转换工具
 */
export class BatchMapperUtils {
  /**
   * 批量转换并过滤空值
   */
  static mapAndFilter<T, R>(
    items: T[], 
    mapper: (item: T) => R | null | undefined
  ): R[] {
    return items
      .map(mapper)
      .filter((item): item is R => item !== null && item !== undefined);
  }

  /**
   * 分页批量转换
   */
  static mapWithPagination<T, R>(
    items: T[],
    mapper: (item: T) => R,
    pageSize: number = 100
  ): R[] {
    const result: R[] = [];
    
    for (let i = 0; i < items.length; i += pageSize) {
      const chunk = items.slice(i, i + pageSize);
      result.push(...chunk.map(mapper));
    }
    
    return result;
  }

  /**
   * 异步批量转换
   */
  static async mapAsync<T, R>(
    items: T[],
    mapper: (item: T) => Promise<R>,
    concurrency: number = 5
  ): Promise<R[]> {
    const result: R[] = [];
    
    for (let i = 0; i < items.length; i += concurrency) {
      const chunk = items.slice(i, i + concurrency);
      const chunkResults = await Promise.all(chunk.map(mapper));
      result.push(...chunkResults);
    }
    
    return result;
  }
}