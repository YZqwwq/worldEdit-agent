# 数据流架构设计文档

## 概述

本文档详细说明了项目中Entity层和VO层的设计理念、使用规范和数据流动关系。

## 架构层次

```
┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Main Process  │
│   (Renderer)    │    │   (Services)    │
├─────────────────┤    ├─────────────────┤
│   Vue Store     │◄──►│   Service Layer │
│   (VO Objects)  │    │   (VO ↔ Entity) │
└─────────────────┘    ├─────────────────┤
                       │  Repository     │
                       │  (Entity Only)  │
                       ├─────────────────┤
                       │   Database      │
                       │   (Tables)      │
                       └─────────────────┘
```

## 层次职责

### 1. Entity层 (`src/shared/entities/`)
- **职责**: 数据库映射，业务实体定义
- **特点**: 
  - 包含TypeORM装饰器
  - 包含数据库关系定义
  - 包含数据验证规则
  - 不应直接暴露给前端

### 2. VO层 (`src/shared/cache-types/agent/vo/`)
- **职责**: 数据传输对象，前端状态管理
- **特点**:
  - 纯TypeScript接口
  - 包含前端特有字段
  - 优化的数据结构
  - 跨进程通信友好

### 3. Mapper层 (`src/shared/mappers/`)
- **职责**: Entity和VO之间的双向转换
- **特点**:
  - 处理字段映射
  - 处理数据类型转换
  - 处理默认值设置
  - 处理关联数据转换

## 数据流动规范

### 1. 创建数据流程

```typescript
// 前端 -> 服务层 -> 数据库
Frontend VO → Service Layer → Mapper.voToEntity() → Repository → Database

// 示例
const sessionVO: ChatSessionVO = {
  title: '新对话',
  agentConfigId: 'agent-123'
};

// 服务层处理
const entityData = ChatSessionMapper.voToEntity(sessionVO);
const entity = repository.create(entityData);
const savedEntity = await repository.save(entity);
const resultVO = ChatSessionMapper.entityToVO(savedEntity);
```

### 2. 查询数据流程

```typescript
// 数据库 -> 服务层 -> 前端
Database → Repository → Mapper.entityToVO() → Service Layer → Frontend VO

// 示例
const entities = await repository.find({ where: { agentConfigId } });
const vos = ChatSessionMapper.entitiesToVOs(entities);
return vos; // 返回给前端
```

### 3. 更新数据流程

```typescript
// 前端 -> 服务层 -> 数据库
Frontend VO → Service Layer → Mapper.updateEntityFromVO() → Repository → Database

// 示例
const existingEntity = await repository.findOne({ where: { id } });
const updatedEntity = ChatSessionMapper.updateEntityFromVO(existingEntity, updateVO);
const savedEntity = await repository.save(updatedEntity);
```

## 使用规范

### 1. 服务层规范

```typescript
export class ChatService {
  // ✅ 正确：输入输出都使用VO
  async createSession(sessionData: Partial<ChatSessionVO>): Promise<ChatSessionVO> {
    const entityData = ChatSessionMapper.voToEntity(sessionData);
    const entity = await this.repository.save(entityData);
    return ChatSessionMapper.entityToVO(entity);
  }

  // ❌ 错误：直接暴露Entity给前端
  async createSession(sessionData: ChatSessionEntity): Promise<ChatSessionEntity> {
    return await this.repository.save(sessionData);
  }
}
```

### 2. 前端状态管理规范

```typescript
// ✅ 正确：前端只使用VO
interface ChatState {
  sessions: ChatSessionVO[];
  currentSession: ChatSessionVO | null;
  messages: ChatMessageVO[];
}

// ❌ 错误：前端使用Entity
interface ChatState {
  sessions: ChatSessionEntity[]; // 不应该在前端使用Entity
}
```

### 3. IPC通信规范

```typescript
// ✅ 正确：IPC传输VO对象
ipcMain.handle('chat:create-session', async (event, sessionVO: ChatSessionVO) => {
  return await chatService.createSession(sessionVO);
});

// ❌ 错误：IPC传输Entity
ipcMain.handle('chat:create-session', async (event, entity: ChatSessionEntity) => {
  // Entity包含TypeORM装饰器，不适合跨进程传输
});
```

## 性能优化策略

### 1. 轻量级VO

```typescript
// 列表场景使用轻量级VO，不包含关联数据
async getSessionList(): Promise<Omit<ChatSessionVO, 'messages' | 'tokenUsages'>[]> {
  const entities = await this.repository.find();
  return entities.map(entity => ChatSessionMapper.entityToLightVO(entity));
}
```

### 2. 分页处理

```typescript
// 大量数据分页处理
async getMessages(sessionId: string, page: number, limit: number) {
  const [entities, total] = await this.repository.findAndCount({
    skip: (page - 1) * limit,
    take: limit
  });
  
  return {
    messages: ChatMessageMapper.entitiesToVOs(entities),
    total,
    hasMore: total > page * limit
  };
}
```

### 3. 关联数据按需加载

```typescript
// 根据需要决定是否加载关联数据
async getSessionDetail(id: string, includeMessages: boolean = false) {
  const relations = includeMessages ? ['messages'] : [];
  const entity = await this.repository.findOne({
    where: { id },
    relations
  });
  
  return ChatSessionMapper.entityToVO(entity);
}
```

## 错误处理

### 1. 数据验证

```typescript
// 在Mapper中进行数据验证
static voToEntity(vo: ChatSessionVO): Partial<ChatSessionEntity> {
  if (!vo.agentConfigId) {
    throw new Error('agentConfigId is required');
  }
  
  return {
    // ... 转换逻辑
  };
}
```

### 2. 空值处理

```typescript
// 安全的空值处理
static entityToVO(entity: ChatSessionEntity): ChatSessionVO {
  return {
    id: entity.id,
    title: entity.title || '未命名对话', // 提供默认值
    messages: entity.messages ? this.convertMessages(entity.messages) : [], // 安全转换
    // ...
  };
}
```

## 最佳实践

### 1. 命名规范
- Entity文件：`*.entity.ts`
- VO文件：`*.ts` (在vo目录下)
- Mapper文件：`*Mapper.ts`

### 2. 目录结构
```
src/shared/
├── entities/           # Entity层
│   └── agent/
├── cache-types/agent/  # VO层
│   ├── vo/
│   └── Enum/
└── mappers/           # 转换层
```

### 3. 依赖关系
- Entity层：独立，不依赖VO
- VO层：独立，不依赖Entity
- Mapper层：依赖Entity和VO
- Service层：使用VO作为接口，内部使用Mapper转换

### 4. 测试策略
- Entity测试：数据库操作测试
- VO测试：类型定义测试
- Mapper测试：转换逻辑测试
- Service测试：业务逻辑测试（使用VO）

## 常见问题

### Q: 为什么不直接使用Entity？
A: Entity包含数据库特定信息（装饰器、关系等），不适合前端使用。VO提供了更清洁的接口。

### Q: 什么时候需要创建新的Mapper？
A: 当有新的Entity-VO对需要转换时，或者需要特殊的转换逻辑时。

### Q: 如何处理复杂的关联关系？
A: 在Mapper中递归转换，或者提供不同级别的转换方法（如轻量级转换）。

### Q: 性能会不会有问题？
A: 合理使用轻量级VO、分页、按需加载等策略可以有效控制性能影响。