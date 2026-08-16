# 文档编辑后续计划

## 当前决策

本专题是当前最高优先级。先建立最小可用的仿 Git 版本基座，再实现文档编辑工具；不先建设分支、合并和提交图等完整 Git 能力。

Agent 统一以 Markdown 读取和写作文档。编辑器与数据库当前仍以 HTML 为真源，由工具边界负责双向转换，历史数据不迁移。

第一版编辑协议采用 Claude Code 风格的语义操作：精确替换、围绕锚点插入、按 Markdown 标题替换章节。系统根据修改前后版本自动生成标准 Diff；Codex 风格通用 Patch 作为后续高级入口，不作为第一版唯一协议。

## 当前基线

- Renderer 页面快照已经随用户消息进入 Agent。
- Agent 能识别当前世界、实体和文档，并读取完整正文。
- 文档工具具有 revision 乐观锁、结构化错误和编辑器变更广播。
- 写入副作用已接入 ChangeSet 与 EffectReceipt 基础协议。
- Agent 文档工具已经使用 `contentMarkdown`，内部负责 Markdown 与 TipTap HTML 转换。

## P0：最小版本基座

- 每次正式写入保存文档、revision、操作者、时间、变更摘要以及修改前后的不可变版本。
- 从前后 Markdown 自动生成机器可用和用户可读的 Diff，Agent 不负责手写版本记录。
- 提供版本列表、版本读取和撤销能力；撤销本身创建新 revision，不删除历史。
- 撤销和写入都校验当前 revision，不能覆盖后续人工编辑。
- 多文档修改继续由 ChangeSet 聚合，但每份文档拥有独立版本记录。

边界：文档版本是业务历史；EffectReceipt 是执行事实；ChangeSet 是跨动作聚合，三者不能互相替代。

验收：并发编辑、撤销后再编辑和跨文档批量修改不会静默覆盖数据。

## P0：Markdown 编辑工具包

第一批工具：

- `replace_text`：只允许唯一匹配；零处或多处匹配时返回结构化错误。
- `insert_before` / `insert_after`：围绕唯一 Markdown 锚点插入。
- `replace_section`：按 Markdown 标题和层级替换完整章节。
- `append_document`：在正文末尾追加内容。
- `rewrite_document`：仅用于用户明确要求的全文重写。
- `preview_document_diff`：预览拟修改结果，不产生持久化副作用。
- `apply_document_edit`：基于 `expectedRevision` 正式提交预览结果。
- `undo_document_revision`：将旧版本恢复为一个新的 revision。

所有编辑操作必须返回修改范围、新 revision、Diff 摘要和可恢复的结构化错误。工具内部可以共享同一套 Markdown 编辑引擎，但 Agent 入口保持简单，不暴露 HTML、数据库字段或内部节点 ID。

验收：Agent 能稳定完成单段替换、章节改写、插入、追加和全文重写；找不到锚点、匹配多处或 revision 过期时不会猜测写入。

## P1：TipTap 节点级编辑

- 为标题、段落、列表等节点定义稳定寻址方式。
- 将选区、光标和选中文本作为短期页面上下文。
- 提供节点读取、替换、插入、删除和移动工具。
- 节点变化或定位失效时返回结构化冲突，不猜测写入位置。
- 局部操作继续使用 revision、Diff、版本历史和撤销链。

验收：局部编辑后目录、大纲、字数、自动保存和 Agent 页面感知保持同步。

## P1：交互收口

- 对不可恢复操作使用应用内确认界面。
- 在 AI 面板展示拟修改范围、执行状态、Diff 和撤销入口。
- Agent 阅读当前文档时保持自然表达，不向用户泄露内部 ID、revision 或工具协议。

## P2：完整仿 Git 能力

- 在真实需求出现后再评估分支、合并、跨文档提交图、标签和历史压缩。
- Codex 风格 Patch 可作为多处非连续修改的高级入口，但必须复用同一版本、预览、冲突与撤销协议。
- 不直接让 Agent 执行 Git 命令；Git 风格能力属于业务版本层，工具只提交明确的文档编辑意图。

## 接续入口

下一次开发从 P0 最小版本基座开始：先确认现有文档 revision、ChangeSet 和事务边界，再设计版本记录实体与迁移；版本读取、Diff 和撤销测试通过后，立即接入 `replace_text` 与 `replace_section` 两个首批编辑工具。
