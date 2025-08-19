# 共享类型定义

本文件夹包含主进程和渲染进程之间共享的类型定义。

## 文件结构

```
src/shared/
└── types/
    └── agent.ts    # AI Agent相关的所有类型定义
```

## 使用方式

### 主进程
```typescript
import { ModelConfig, AgentConfig } from '../types/agent'
```

### 渲染进程
```typescript
import { ModelConfig, AgentConfig } from '../types/agent'
```

## 重构说明

原本主进程和渲染进程各自维护一份几乎相同的类型定义文件：
- `src/main/types/agent.ts`
- `src/renderer/src/types/agent.ts`

现在统一迁移到共享文件夹：
- `src/shared/types/agent.ts`

原有的类型文件现在只是重新导出共享类型，保持向后兼容性：

```typescript
// 重新导出所有共享类型定义
export * from '../../shared/types/agent'
```

## 优势

1. **避免代码重复**：消除了两个进程间的重复类型定义
2. **保证类型一致性**：确保主进程和渲染进程使用相同的类型定义
3. **便于维护**：只需在一个地方更新类型定义
4. **向后兼容**：现有的导入路径仍然有效
5. **符合最佳实践**：遵循Electron应用的推荐架构模式