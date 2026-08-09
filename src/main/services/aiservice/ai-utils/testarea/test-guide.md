# Agent 测试清单

## 用途

本目录优先按用户场景组织测试，用于确认页面感知、Agent 执行、工具反馈、记忆和最终提交能够共同形成一致的应用体验。

新增或修改 Agent 能力时，应先找到对应场景测试；不存在时先补场景，再补模块级契约测试。

## 运行命令

```bash
# 全部 Agent 核心回归
npm run test:agent-core

# 用户场景基线
npm run test:agent-scenario
```

## 完整交互场景

### 文档页面讨论其他实体

- [x] 页面快照从用户事件传递到 Agent Runtime。
- [x] 文档页面激活 `world_document_editor` 能力包。
- [x] 目录读取和正文读取记录进入同一 Turn Workspace。
- [x] Graph 最终回复覆盖流式中间文本，成为唯一提交内容。
- [x] 正常完成只产生一次 Turn 提交。
- [x] UI 完成内容与提交回复一致。
- [ ] 人物或目标文档不存在时返回可理解反馈，并停止重复调用。
- [ ] 用户在工具执行期间发送新消息时，两轮页面快照和结果互不污染。
- [ ] 读取完成后发生中断时，不重复提交工具结果、回复或记忆。
- [ ] 数据库提交失败并重启后，可恢复未完成轮次且不重复写入。

测试文件：[mainAgentScenarioBaseline.test.ts](./mainAgentScenarioBaseline.test.ts)

## 单轮执行与提交

### Turn Workspace

- [x] 草稿修改不改变本轮基础快照。
- [x] 同一成功工具不会产生重复完成记录。
- [x] 后台人格阶段跳过用户交互式感知。
- [x] 后台人格提交不能发布用户 Memory Slots。

测试文件：[turnWorkspace.test.ts](./turnWorkspace.test.ts)

### 工具循环生命周期

- [x] 同一工具可以执行多个不同的有效动作。
- [x] 后续成功结果能够闭合之前的部分结果。
- [x] 工具结果在下一次模型调用前进入本轮上下文。
- [x] 达到循环上限后进入显式收尾阶段。
- [x] 确定性参数错误不会使用相同参数无限重试。
- [x] eventual 工具在明确完成前保持未完成状态。

测试文件：[turnExecutionLifecycle.test.ts](./turnExecutionLifecycle.test.ts)

## 工具系统

### 工具返回协议

- [x] 只读工具向下一轮模型暴露完整验证结果。
- [x] 写入工具返回收据，不回显完整写入载荷。
- [x] 工具说明包含使用规则和合法参数示例。
- [x] eventual 工具不会把已受理误报为已完成。

测试文件：[toolModelResult.test.ts](./toolModelResult.test.ts)

### 结构化错误

- [x] 非法输出转换为不可重试的结构化错误。
- [x] 业务错误保留错误码、可重试性和恢复建议。
- [x] 文档 revision 冲突被统一识别。
- [x] 未知异常转换为内部错误，不诱导盲目重试。

测试文件：[toolErrorProtocol.test.ts](./toolErrorProtocol.test.ts)

### 工具注册表

- [x] 完整注册表配置可以通过启动校验。
- [x] 拒绝重名工具和不存在的工具集。
- [x] 拒绝访问权限与元数据不一致。
- [x] task-context 工具不能被普通激活入口暴露。
- [x] 单轮工具调用次数限制生效。

测试文件：[toolRegistryValidation.test.ts](./toolRegistryValidation.test.ts)

### 世界观文档工具参数

- [x] 世界级与实体级目录使用扁平参数。
- [x] 旧版嵌套 owner 参数不再进入 Agent 契约。
- [x] 文档创建与目录读取使用相同归属参数形式。

测试文件：[worldDocumentToolContract.test.ts](./worldDocumentToolContract.test.ts)

## 记忆系统

### Recall 语义

- [x] 自然的历史指代可以回落到近期上下文。
- [x] 带明确主题的历史查询保留检索主题。
- [x] 普通主题查询不被错误改写。
- [x] 短期窗口排除只移除最新匹配消息。

测试文件：[recallSemantics.test.ts](./recallSemantics.test.ts)

### Stage 归档边界

- [x] 消息不足时不生成无意义阶段。
- [x] 只有 AI 消息可以闭合正常语义阶段。
- [x] Runtime 硬上限可以归档完整对话前缀。
- [x] 纯 User 缓冲不会被伪装成完整阶段。
- [x] 延迟 AI 回复可以闭合超限缓冲。

测试文件：[memoryArchivePolicy.test.ts](./memoryArchivePolicy.test.ts)

## 手动联网探针

以下文件依赖真实 API、模型、网络和外部数据，不属于 `test:agent-core` 稳定回归：

- [dashscopeWebSearchDocCases.cjs](./dashscopeWebSearchDocCases.cjs)：验证 DashScope 联网搜索文档案例和响应结构。
- [officialWebSearchStructureProbe.cjs](./officialWebSearchStructureProbe.cjs)：探测官方联网搜索返回结构。

运行前不得把 API Key 写入仓库。使用环境变量或本机临时配置，并避免在测试输出中打印凭据。

## 维护规则

1. 测试名称描述用户可观察行为，不描述内部函数实现。
2. 场景测试保留真实编排协议，只替换模型、网络和数据库等不确定边界。
3. 修复用户问题时先增加能够复现问题的失败场景，再修改实现。
4. 新增测试文件后，将命令加入 `package.json`，并在本清单登记。
5. 不把依赖真实网络或付费模型的探针加入默认核心回归。
