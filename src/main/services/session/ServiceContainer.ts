/**
 * 简单的服务容器实现
 * 用于管理依赖注入，替代NestJS的功能
 * 项目里的“轻量级依赖注入容器”，用于在主进程管理和协调各类服务的创建、生命周期与获取
 */

import { IServiceContainer } from '../../../shared/cache-types/session/session-manager.types'
/**
 * 服务工厂函数类型
 */
type ServiceFactory<T = any> = () => T

/**
 * 服务注册信息
 */
interface ServiceRegistration {
  factory: ServiceFactory
  singleton: boolean
  instance?: any
}

/**
 * 服务容器实现
 */
export class ServiceContainer implements IServiceContainer {
  private services = new Map<string, ServiceRegistration>()
  private instances = new Map<string, any>()

  /**
   * 注册瞬态服务（每次获取都创建新实例）
   */
  register<T>(token: string, factory: ServiceFactory<T>): void {
    this.services.set(token, {
      factory,
      singleton: false
    })
  }

  /**
   * 注册单例服务（只创建一次实例）
   */
  registerSingleton<T>(token: string, factory: ServiceFactory<T>): void {
    this.services.set(token, {
      factory,
      singleton: true
    })
  }

  /**
   * 注册实例（直接注册已创建的实例）
   */
  registerInstance<T>(token: string, instance: T): void {
    this.services.set(token, {
      factory: () => instance,
      singleton: true,
      instance
    })
    this.instances.set(token, instance)
  }

  /**
   * 获取服务实例
   */
  get<T>(token: string): T {
    const registration = this.services.get(token)
    if (!registration) {
      throw new Error(`Service '${token}' is not registered`)
    }

    // 如果是单例且已有实例，直接返回
    if (registration.singleton) {
      let instance = this.instances.get(token)
      if (!instance) {
        instance = registration.factory()
        this.instances.set(token, instance)
      }
      return instance
    }

    // 瞬态服务，每次创建新实例
    return registration.factory()
  }

  /**
   * 检查服务是否已注册
   */
  has(token: string): boolean {
    return this.services.has(token)
  }

  /**
   * 清空所有服务注册
   */
  clear(): void {
    this.services.clear()
    this.instances.clear()
  }

  /**
   * 销毁容器，清理资源
   */
  async dispose(): Promise<void> {
    // 调用所有实例的destroy方法（如果存在）
    const disposePromises: Promise<void>[] = []
    
    for (const [token, instance] of this.instances) {
      if (instance && typeof instance.destroy === 'function') {
        try {
          const result = instance.destroy()
          if (result instanceof Promise) {
            disposePromises.push(result)
          }
        } catch (error) {
          console.error(`Error disposing service '${token}':`, error)
        }
      }
    }

    // 等待所有销毁操作完成
    await Promise.allSettled(disposePromises)
    
    // 清空容器
    this.clear()
  }

  /**
   * 获取所有已注册的服务令牌
   */
  getRegisteredTokens(): string[] {
    return Array.from(this.services.keys())
  }

  /**
   * 获取所有已创建的实例令牌
   */
  getInstanceTokens(): string[] {
    return Array.from(this.instances.keys())
  }

  /**
   * 强制重新创建单例实例
   */
  recreateSingleton<T>(token: string): T {
    const registration = this.services.get(token)
    if (!registration) {
      throw new Error(`Service '${token}' is not registered`)
    }

    if (!registration.singleton) {
      throw new Error(`Service '${token}' is not a singleton`)
    }

    // 删除旧实例
    this.instances.delete(token)
    
    // 创建新实例
    const newInstance = registration.factory()
    this.instances.set(token, newInstance)
    
    return newInstance
  }
}

/**
 * 全局服务容器实例
 */
export const serviceContainer = new ServiceContainer()

/**
 * 装饰器工厂：标记类为可注入的服务
 * 这是一个简化版本，主要用于代码标识
 */
export function Injectable(token?: string) {
  return function <T extends new (...args: any[]) => any>(constructor: T) {
    // 在类上添加元数据标记
    Object.defineProperty(constructor, '__injectable__', {
      value: true,
      enumerable: false,
      writable: false
    })
    
    if (token) {
      Object.defineProperty(constructor, '__token__', {
        value: token,
        enumerable: false,
        writable: false
      })
    }
    
    return constructor
  }
}

/**
 * 辅助函数：检查类是否标记为可注入
 */
export function isInjectable(constructor: any): boolean {
  return constructor && constructor.__injectable__ === true
}

/**
 * 辅助函数：获取类的注入令牌
 */
export function getInjectableToken(constructor: any): string | undefined {
  return constructor && constructor.__token__
}