# 世界观架构设计工作流程

## 标准工作流程

### 阶段1：需求分析与现状评估

#### 🔍 需求收集
1. **功能需求分析**
   - 确定世界观的核心要素（地理、政治、文化等）
   - 识别用户交互场景和使用模式
   - 明确数据查询和操作的频率

2. **技术约束评估**
   - 现有技术栈分析（TypeScript, TypeORM, Electron）
   - 性能要求和数据量预估
   - 兼容性和迁移需求

3. **现状代码审查**
   ```bash
   # 检查现有类型定义
   find src/shared/types -name "*.ts" -exec echo "=== {} ===" \; -exec cat {} \;
   
   # 分析实体关系
   grep -r "interface.*Data" src/shared/types/
   
   # 查看数据库实体
   find src/shared/entities -name "*.ts"
   ```

#### 📊 现状评估报告
- **优势分析**：现有设计的合理之处
- **问题识别**：类型不一致、关系模糊、扩展性不足
- **改进机会**：性能优化、类型安全、代码复用

### 阶段2：架构设计

#### 🏗️ 数据模型设计
1. **核心实体定义**
   ```typescript
   // 基础元数据接口
   interface BaseMetadata {
     id: string;
     createdAt: Date;
     updatedAt: Date;
     version: number;
   }
   
   // 世界观核心实体
   interface WorldData extends BaseMetadata {
     name: string;
     description: string;
     // ... 其他属性
   }
   ```

2. **关系映射设计**
   ```typescript
   // 一对多关系
   interface WorldData {
     nations: NationData[];
     factions: FactionData[];
   }
   
   // 多对多关系
   interface NationData {
     alliances: string[]; // Nation IDs
     conflicts: string[]; // Nation IDs
   }
   ```

3. **TypeORM实体映射**
   ```typescript
   @Entity('worlds')
   export class World {
     @PrimaryGeneratedColumn('uuid')
     id: string;
     
     @Column()
     name: string;
     
     @OneToMany(() => Nation, nation => nation.world)
     nations: Nation[];
   }
   ```

#### 🔧 技术架构设计
1. **分层架构**
   - **类型层**：TypeScript接口定义
   - **实体层**：TypeORM实体类
   - **服务层**：业务逻辑和数据操作
   - **接口层**：IPC通信和API设计

2. **模块划分**
   ```
   src/shared/
   ├── types/          # TypeScript类型定义
   ├── entities/       # TypeORM实体
   └── interfaces/     # 服务接口
   
   src/main/services/  # 主进程服务
   src/renderer/services/ # 渲染进程服务
   ```

### 阶段3：实现指导

#### 📝 代码实现步骤
1. **类型定义优先**
   ```typescript
   // 1. 定义基础类型
   export interface BaseMetadata { /* ... */ }
   
   // 2. 定义业务类型
   export interface WorldData extends BaseMetadata { /* ... */ }
   
   // 3. 定义关系类型
   export interface WorldRelations { /* ... */ }
   ```

2. **实体类实现**
   ```typescript
   // 使用装饰器定义实体
   @Entity()
   export class World implements WorldData {
     // 属性定义
     // 关系定义
     // 方法定义
   }
   ```

3. **服务层实现**
   ```typescript
   export class WorldService {
     async createWorld(data: Partial<WorldData>): Promise<WorldData> {
       // 实现创建逻辑
     }
     
     async getWorldWithRelations(id: string): Promise<WorldData & WorldRelations> {
       // 实现关系查询
     }
   }
   ```

#### 🧪 测试策略
1. **类型测试**
   ```typescript
   // 类型兼容性测试
   const testWorld: WorldData = {
     id: 'test',
     name: 'Test World',
     // ... 验证所有必需属性
   };
   ```

2. **单元测试**
   ```typescript
   describe('WorldService', () => {
     it('should create world with valid data', async () => {
       // 测试创建功能
     });
   });
   ```

### 阶段4：优化与维护

#### 🚀 性能优化
1. **查询优化**
   - 添加适当的数据库索引
   - 使用延迟加载避免N+1问题
   - 实现查询缓存机制

2. **类型优化**
   - 使用联合类型减少运行时检查
   - 实现类型守卫提高类型安全
   - 优化类型推导减少显式注解

#### 📚 文档维护
1. **API文档**
   ```typescript
   /**
    * 创建新的世界观
    * @param data 世界观数据
    * @returns 创建的世界观实例
    * @example
    * ```typescript
    * const world = await worldService.createWorld({
    *   name: 'My World',
    *   description: 'A fantasy world'
    * });
    * ```
    */
   async createWorld(data: Partial<WorldData>): Promise<WorldData>
   ```

2. **迁移指南**
   - 版本升级步骤
   - 数据迁移脚本
   - 兼容性说明

## 质量保证

### ✅ 检查清单
- [ ] 所有实体都有完整的TypeScript类型定义
- [ ] 实体关系清晰且一致
- [ ] 数据库约束和索引合理
- [ ] 单元测试覆盖核心功能
- [ ] 性能测试通过
- [ ] 文档完整且准确

### 🔄 持续改进
1. **定期评审**：每月检查架构合理性
2. **性能监控**：跟踪查询性能和数据增长
3. **用户反馈**：收集使用体验和改进建议
4. **技术更新**：跟进TypeScript和TypeORM新特性

通过这套标准化的工作流程，确保世界观数据架构的设计质量和实施效果。