# 文档编辑后续计划

## 当前状态

本专题是当前最高优先级。Git 式最小版本基座主体已经完成；不预先建设分支、合并、标签等完整 Git 能力。

Agent 统一以 Markdown 读取和写作文档。版本历史与 Diff 只保存和比较用户实际编辑的源数据，不保存每次 Runtime 为渲染生成的 HTML。编辑态最终采用 Markdown 还是其他编辑器源格式，实施前结合现有数据再确认。

第一版编辑协议采用 Claude Code 风格的语义操作：精确替换、围绕锚点插入、按 Markdown 标题替换章节。系统根据修改前后版本自动生成标准 Diff；Codex 风格通用 Patch 作为后续高级入口，不作为第一版唯一协议。

## 跨设备接续摘要（2026-08-18）

当前阶段：Git 式文档版本基座、历史查询、Diff、整库/选择性恢复、检查点、独立设定方案、三方合并、撤销、摘取、版本包交换、完整性检查和不可达对象清理已经实现；Markdown 语义编辑工具尚未开始。

切换设备前注意：当前工作区仍有大量未提交变更，包括测试目录迁移、跨平台 Electron 测试入口、3 秒自动保存、串行强制保存和历史 Session 提交队列。必须先提交并推送全部新增、删除和移动文件，否则另一台设备只拉取已有提交无法获得本阶段实现。

关键实现入口：

- `worldDocumentVersionService.ts`：内容版本、树对象、提交、暂存与恢复核心。
- `worldDocumentVersionRepositoryService.ts`：历史列表、提交详情和恢复应用服务。
- `worldDocumentDiffService.ts`：只基于编辑态生成可读 Diff。
- `WorldDocument*Record.ts`：内容版本、树对象、提交和变更记录实体。
- `worldEntityDocumentService.ts`：所有文档写入接入版本事务。
- `WorldEntityDocumentEditorView.vue`、`serialSaveCoordinator.ts`：3 秒自动保存、强制保存等待和历史 Session 串行封口。
- `testarea/tests`、`testarea/workers`、`scripts/test/run-electron-test.cjs`：普通回归、故障进程和跨平台 Electron 测试入口。

已验证：

- `npm run typecheck:node` 通过。
- `npm run typecheck:web` 通过。
- `npm run test:save-coordinator` 通过（5 项）。
- `npm run test:document-version` 的 2 项纯 Diff 测试通过。
- 最新完整 `npm run test:agent-core` 通过。

跨平台 Electron 测试工具已经建立统一套件清单和原生 ABI 预检。Windows x64 已真实执行完整矩阵；macOS 仍需使用本机安装的依赖复验。换到另一平台后，使用项目要求的 Node 版本完成 `npm ci`、`npm run rebuild`，再执行：

```bash
npm run test:integration:electron
```

## 当前基线

- Renderer 页面快照已经随用户消息进入 Agent。
- Agent 能识别当前世界、实体和文档，并读取完整正文。
- 文档工具具有 revision 乐观锁、结构化错误和编辑器变更广播。
- 写入副作用已接入 ChangeSet 与 EffectReceipt 基础协议。
- Agent 文档工具已经使用 `contentMarkdown`，内部负责 Markdown 与 TipTap HTML 转换。

## 已落地：Git 式版本架构

### 总体边界

- 一个世界对应一个逻辑版本空间，不为每个人物或每份文档建立独立仓库。
- 每份文档保留独立内容版本；人物、势力等实例只作为文档归属和树结构范围。
- 一次用户编辑任务或 Agent 任务形成一个 ChangeSet，可同时聚合多个文档和树节点变化。
- 当前文档数据是工作区；尚未结束的 ChangeSet 类似暂存区；封口后的 ChangeSet 与文档树快照组成一次提交。

### 内容与提交

- 当前 `revision` 继续用于自动保存和并发冲突检查，不等同于 Git 提交。
- 编辑器停止输入约 3 秒后自动保存工作区，不为每次保存制造用户可见历史。
- 文档内容版本保存不可变的编辑态快照，Diff 由相邻快照生成；运行时 HTML 不进入 Diff。
- Agent 在 Turn 完整/中断提交时封口；人工编辑在空闲约 5 秒、强制保存或离开页面时封口。

### 文档树

- 每次提交指向当时完整的逻辑文档树，树中记录文档归属、父子关系、标题、顺序和对应内容版本。
- 未变化的内容和子树直接复用，只为发生变化的节点及其上级路径产生新树状态，不复制整个世界。
- 新增表现为新树中出现节点；删除表现为新树中不再引用节点；删除整个目录只需从父树移除该子树引用，旧提交仍可完整恢复。
- 系统保留稳定 `documentId`，因此移动、重命名和排序可以精确记录，不依赖 Git 的路径相似度推断。

### 职责分离

- 文档内容版本：保存可恢复的编辑态。
- 文档树快照：保存某次提交时整棵树的状态。
- ChangeSet：说明一次任务共同修改了哪些内容和树节点。
- EffectReceipt：记录工具是否实际执行成功，不承担文档历史职责。

### 第一阶段不做

- 分支、合并、标签和远端同步。
- 每次自动保存都生成正式提交。
- 直接让 Agent 执行系统 Git 命令。
- 一开始就实现完整世界任意时间点的复杂检出流程。

## P0：最小版本基座（主体完成）

- 建立文档编辑态版本、文档树快照和正式提交的最小数据结构。
- 从前后编辑态自动生成机器可用和用户可读的 Diff，Agent 不负责手写版本记录。
- 新增、删除、移动、重命名和排序都进入同一套树历史。
- 提供版本列表、版本读取和撤销能力；撤销产生新版本和新提交，不删除历史。
- 撤销和写入都校验当前 revision，不能覆盖后续人工编辑。
- 多文档修改继续由 ChangeSet 聚合，每份文档仍拥有独立内容版本。

边界：内容版本与树快照是业务历史；ChangeSet 是跨动作聚合；EffectReceipt 是执行事实，三者不能互相替代。

验收：能准确识别并恢复内容修改、节点新增、节点删除和整棵子树删除；并发编辑、撤销后再编辑和跨文档批量修改不会静默覆盖数据。

### 当前实现进度

已完成：

- 已建立不可变编辑态内容版本、可复用文档树对象、世界提交和暂存变更记录。
- 内容版本保存调用方提供的编辑态：Agent 保存 Markdown，编辑器保存自身编辑态；Runtime 转换出的 HTML 不进入 Agent 版本 Diff 来源。旧数据首次纳入历史时只能以现有编辑器 HTML 建立一次基线。
- 新增、更新、移动、排序、删除和递归删除都经过统一历史入口，并与实际文档写入处于同一事务。
- Agent 多次文档工具修改随 Turn ChangeSet 暂存，在 Turn 完整提交或中断提交时形成一个世界提交。
- 人工编辑停止输入约 3 秒后自动保存工作区；连续输入在空闲约 5 秒、强制保存或离开页面时形成一次提交。
- 一次拖拽引起的多个同级排序更新使用同一历史会话，不拆成多个提交。
- 进程重启时先恢复并判定所属 Turn，再分类处理暂存变更；运行中的 Agent ChangeSet 保持暂存，只有终态 Turn 与人工会话会被幂等封口。
- 已具备按旧提交重建文档树并创建新提交的底层恢复能力；恢复不会改写或删除旧历史。
- 已提供世界提交历史与提交详情 API，返回每次提交涉及的文档、树元数据变化和编辑态 Diff。
- 编辑器已加入版本历史面板，可以查看人工/Agent 提交、逐文档变化以及新增/删除行数。
- 编辑器可以将整个世界文档库恢复到指定提交；恢复前重新校验最新 HEAD，并明确创建新的恢复提交。
- HTML 编辑态只在读取历史时临时转为 Markdown 以提高 Diff 可读性，转换结果不作为历史真源保存。

尚未完成：

- 当前恢复入口按整个世界提交恢复，尚未增加“只恢复其中一份文档”的选择性恢复。
- 历史与恢复能力尚未开放为 Agent 工具，当前只由编辑器用户操作。
- 历史面板首版只读取最近 50 个用户可见提交，尚未增加分页和按文档筛选。
- 编辑态长期统一为 Markdown 还是保留编辑器源格式仍需结合富文本节点审计决定。
- 已建立 macOS/Windows 共用的 Electron 测试入口；Windows x64 已通过完整原生 SQLite 与故障恢复矩阵，macOS 仍需在对应设备使用本机依赖复验。
- 当前开发环境仍依赖 TypeORM `synchronize` 建表，正式发布前需要显式迁移。

### 下一阶段：版本基座加固

ChangeSet 快照隔离已经完成：新 Commit 只由 HEAD Tree 与当前 ChangeSet 派生，业务写入前确保 Baseline，TreeEntry 保存独立 revision；未提交的其他工作态不会混入当前提交，较晚封口的旧 ChangeSet 不会回退父 Tree 中更新的同一文档。

进一步完成的基座加固：

- ChangeSet 一旦形成 Commit 即永久封口，迟到写入会让同一事务中的文档修改回滚，并返回 `CHANGESET_CLOSED`。
- Markdown/HTML 编辑源必须与实际工作区正文一致，禁止历史源和可见内容分叉。
- 恢复比较包含 schemaVersion，恢复后的 revision 保持递增。
- Electron 使用单实例锁保护单写者模型；SQLite 启用 WAL、`busy_timeout`、外键检查和 NORMAL synchronous。
- 新增应用版 `fsck`，检查 Commit 父链、sequence、Tree/Content 哈希、对象引用、ChangeRecord 归属和不可达对象；通过 Main/Preload/Renderer 服务开放诊断报告。
- 文档历史高频查询索引进入显式迁移账本；迁移可重复执行且只记录一次。

#### P0：macOS 原生矩阵待执行

测试源码和统一 runner 可在 macOS/Windows 复用，但 `better-sqlite3` 与 Electron 二进制必须在各平台单独安装和重建。Windows x64 已通过原生环境预检和全部 Electron 集成套件，包括 SQLite 事务、文档树恢复、Turn Version、Effect 强杀恢复与 Turn 强杀恢复。macOS 尚无真实执行证据。

验收：macOS 使用本机 `npm ci`、`npm run rebuild` 后完整通过 `npm run test:integration:electron`，不能复制 Windows 的原生 `node_modules`。

#### 已完成：启动恢复顺序

- 启动流程先执行 Agent Turn 恢复与旧暂停状态对账，再处理文档 staged ChangeSet。
- 人工会话可以在启动时封口；Agent ChangeSet 只有在所属 Turn 已完成、已中断、失败或取消后才会形成正式文档提交。
- 仍在排队或运行的 Turn 保持 staged；缺少 ChangeSet/Turn 归属或归属不一致的记录保持 staged，不由启动过程猜测提交。
- 已存在 Commit 的重复对账会补齐 ChangeRecord 的 committed 状态，不制造第二个提交。

验收已覆盖：人工、终态 Agent、运行中 Agent、孤儿 ChangeSet 四类启动恢复，以及提交幂等性。

#### P1：性能与存储成本

- Commit 和整库恢复仍接近全量 O(N)，并存在逐文档、逐 TreeObject 的 N+1 查询；数百至上千文档时可能造成主进程卡顿。先批量读取，再根据实测决定是否实现增量路径重建。
- ChangeRecord 与 ContentVersion 重复保存前后正文，长期历史约保存 2～3 份内容；后续改为引用前后 ContentVersion。
- ChangeRecord 缺少 `commitId`、独立 `status` 索引；提交序号采用“查询最大值再加一”且没有唯一冲突重试。
- 删除后恢复的 revision 不保证严格单调；正式发布前仍需 TypeORM 显式迁移，不能长期依赖 `synchronize`。

验收：增加 10/100/1000 文档的提交与恢复基准；历史增长后详情和 staged 查询不退化为全表扫描；revision 与 sequence 冲突有确定处理。

## 应用专用 Git 演进

目标不是复制命令行 Git，而是让世界观创作获得同等级别的可追踪、可试验、可恢复和可合并能力。

### P0：状态与精确恢复

- 提供世界版本状态：HEAD、当前 staged ChangeSet、涉及文档、来源和未封口原因。
- 支持只恢复一次 Commit 中选中的文档或子树，并生成新的恢复 Commit。
- 支持命名检查点，相当于面向用户的 Tag，例如“第一卷定稿”“力量体系重构前”。
- Commit 增加稳定作者、Turn/Session 来源、恢复来源和操作意图，不把内部 ID 暴露给普通 UI。

当前进度：编辑器历史工作台已提供 HEAD/待封口/完整性状态、版本搜索、当前文档筛选、任意版本比较、命名检查点和按文档/目录选择性恢复。恢复来源及操作意图写入 Commit；恢复始终产生新 Commit。

### P1：平行设定草案

- Branch 对用户表现为“设定方案”或“草案线”，用于尝试不同人物走向、国家关系和力量体系。
- 主工作区只跟踪一个活动方案；切换前必须处理 staged 内容，不允许静默覆盖。
- 分支共享不可变 Content/Tree 对象，仅增加 Ref 和独立 HEAD，不复制正文。

当前进度：已建立独立方案 Ref 与活动 HEAD；可从任意版本创建、重命名、删除和切换方案。切换前强制封口人工会话，有 staged 变更时后端拒绝检出；检出复用不可变 Tree/Content 且不制造伪 Commit。

### P1：三方合并

- 使用共同祖先、当前方案和待合并方案做三方比较。
- 首先按 documentId、树位置和 revision 判定结构冲突，再按 Markdown 标题/段落生成内容冲突。
- 无冲突修改自动合并；冲突以应用内交互文档呈现，由用户或 Agent 明确解决后形成 Merge Commit。
- 人物关系等结构化数据未来进入同一世界 ChangeSet，但使用各自的 Merge Driver。

当前进度：已按共同祖先、当前方案和来源方案生成三方预览。不同文档的单边变化自动合并；同一 Markdown 文档中互不重叠的行/段落变化由三方 Merge Driver 自动合并。重叠修改、删除/修改、超大文档和非 Markdown 编辑源继续按整份文档显式选择当前侧或来源侧。确认后生成包含第二父提交的 Merge Commit。

### P2：创作增强

- 文档章节级 provenance/blame：能回答某段设定由用户、Agent 或哪次任务产生。
- Agent 修改前自动创建轻量检查点，长任务可在一个 ChangeSet 内保存多个不可见恢复点。
- 支持对比任意两个检查点、按实体筛选历史、按章节查看演变。
- 为重大设定冲突建立语义检查，但语义结果只做提示，不代替确定性版本判断。

### P2：存储与交换

- ChangeRecord 改为引用前后 ContentVersion，避免重复保存正文。
- 批量加载 Tree/Content，逐步实现变化路径重建、对象压缩和可达性 GC。
- 提供世界版本包导出/导入；远端同步建立在对象和 Ref 协议上，不直接暴露系统 Git 仓库。
- 在所有业务表具备显式迁移后关闭 TypeORM `synchronize`；关闭前迁移账本只接管已登记模块，不能宣称全库迁移完成。

当前进度：已支持带格式版本号和整体 SHA-256 摘要的 JSON 版本包，包含方案/检查点 Ref 与 Commit、Change、Tree、Content 对象。导入会复验包摘要和全部内容寻址对象，只接受同一世界且当前历史为版本包前缀的情况；已有历史下导入为非活动方案，不覆盖当前工作区。全局 GC 在完整性检查通过后只清理任何提交都不可达的 Tree/Content。密码学签名、远端协商和对象压缩尚未实现。

### 已完成：面向提交的操作

- `restore`：把整个世界、文档或目录恢复到旧状态并创建新提交。
- `revert`：反向应用某次提交涉及的文档状态并创建新提交。
- `cherry-pick`：把某次提交涉及的文档状态摘取到当前方案并创建新提交。
- 三者都校验当前活动方案 HEAD；旧提交、分支和检查点保持不可变。

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

下一步接入 `replace_text` 与 `replace_section`；macOS 设备上补跑同一 Electron 集成矩阵。选择性单文档恢复没有明确场景时继续暂缓。
