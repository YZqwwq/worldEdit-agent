# 文档编辑后续计划

## 当前状态

Git 式版本基座及应用所需的方案分支、合并、检查点和恢复能力已经完成。后续不继续复制完整 Git，而是优先保证历史准确性、规模性能和 Agent 编辑能力。

Agent 统一以 Markdown 读取和写作文档。版本历史与 Diff 只保存和比较用户实际编辑的源数据，不保存每次 Runtime 为渲染生成的 HTML。编辑态最终采用 Markdown 还是其他编辑器源格式，实施前结合现有数据再确认。

第一版编辑协议采用 Claude Code 风格的语义操作：精确替换、围绕锚点插入、按 Markdown 标题替换章节。系统根据修改前后版本自动生成标准 Diff；Codex 风格通用 Patch 作为后续高级入口，不作为第一版唯一协议。

## 跨设备接续摘要（2026-08-18）

当前阶段：Git 式文档版本基座与主要恢复能力已完成；Markdown 语义编辑已接入 `replace_text` 和 `replace_section`，Diff 已升级为带双行号的 Hunk 结构。

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

跨平台 Electron 测试工具已经建立统一套件清单和原生 ABI 预检。Windows x64 与 macOS ARM64 均已真实执行完整矩阵。换到另一平台后，使用项目要求的 Node 版本完成 `npm ci`、`npm run rebuild`，再执行：

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
- macOS/Windows 共用的 Electron 测试入口与两端原生矩阵已经完成。
- 全库静态基线与增量迁移已经完成，应用、测试、基准和故障注入进程统一使用 `synchronize: false`。

### 下一阶段：版本基座加固

ChangeSet 快照隔离已经完成：新 Commit 只由 HEAD Tree 与当前 ChangeSet 派生，业务写入前确保 Baseline，TreeEntry 保存独立 revision；未提交的其他工作态不会混入当前提交，较晚封口的旧 ChangeSet 不会回退父 Tree 中更新的同一文档。

#### P0：活动方案修改前来源准确性（已完成）

- 修改前正文从当前活动方案 HEAD 的不可变 Tree/Content 读取，不再按 ContentVersion 创建时间猜测。
- HEAD 来源必须与当前工作区正文一致；工作区确实领先于 HEAD 时，使用当前编辑态作为安全回退，不借用其他方案内容。
- 已增加跨方案测试，确保另一方案较新的 ContentVersion 不会污染当前方案的历史 Diff。

用户影响：切换设定方案后继续编辑时，版本 Diff 不会错误显示另一方案的正文。维护影响：ChangeRecord 的修改前来源与提交父树保持一致，后续 provenance 和局部编辑可以依赖该边界。

进一步完成的基座加固：

- ChangeSet 一旦形成 Commit 即永久封口，迟到写入会让同一事务中的文档修改回滚，并返回 `CHANGESET_CLOSED`。
- Markdown/HTML 编辑源必须与实际工作区正文一致，禁止历史源和可见内容分叉。
- 恢复比较包含 schemaVersion，恢复后的 revision 保持递增。
- Electron 使用单实例锁保护单写者模型；SQLite 启用 WAL、`busy_timeout`、外键检查和 NORMAL synchronous。
- 新增应用版 `fsck`，检查 Commit 父链、sequence、Tree/Content 哈希、对象引用、ChangeRecord 归属和不可达对象；通过 Main/Preload/Renderer 服务开放诊断报告。
- 文档历史高频查询索引进入显式迁移账本；迁移可重复执行且只记录一次。

#### 已完成：macOS 原生矩阵

测试源码和统一 runner 可在 macOS/Windows 复用，但 `better-sqlite3` 与 Electron 二进制必须在各平台单独安装和重建。Windows x64 与 macOS ARM64 均已通过原生环境预检和全部 Electron 集成套件，包括 SQLite 事务、文档树恢复、Turn Version、Effect 强杀恢复与 Turn 强杀恢复。

验收：macOS 使用本机 `npm ci`、`npm run rebuild` 后完整通过 `npm run test:integration:electron`，不能复制 Windows 的原生 `node_modules`。

#### 已完成：启动恢复顺序

- 启动流程先执行 Agent Turn 恢复与旧暂停状态对账，再处理文档 staged ChangeSet。
- 人工会话可以在启动时封口；Agent ChangeSet 只有在所属 Turn 已完成、已中断、失败或取消后才会形成正式文档提交。
- 仍在排队或运行的 Turn 保持 staged；缺少 ChangeSet/Turn 归属或归属不一致的记录保持 staged，不由启动过程猜测提交。
- 已存在 Commit 的重复对账会补齐 ChangeRecord 的 committed 状态，不制造第二个提交。

验收已覆盖：人工、终态 Agent、运行中 Agent、孤儿 ChangeSet 四类启动恢复，以及提交幂等性。

#### P1：性能与存储成本

- 完整性结果已经加入持久化 generation 缓存。Commit、Change、Content、Branch、Checkpoint 的数据库写入通过触发器自动失效；Tree 被修改或删除时全局失效。历史未变化时不再重复执行完整扫描，显式检查仍保留完整 `fsck`。
- 已建立 Electron ABI 下 10/100/1000 文档基准。当前 macOS ARM64 的 1000 文档结果：基线约 111ms、单文档提交约 47ms、恢复约 71ms、完整性冷检查约 11ms、缓存命中约 0.05ms。
- 当前数据不支持立即引入常驻数据库工作线程：正常提交尚未达到明显阻塞等级，而跨线程事务、按世界队列和关闭恢复协议成本较高。文档规模或实测提交稳定超过约 100ms 后再评估；基线导入可以继续后台化，但不是当前交互高频路径。
- ChangeRecord 正文去重已经完成：新记录只保存 `beforeContentVersionId` / `afterContentVersionId`，Diff、提交、版本包、GC 与完整性检查统一解引用 ContentVersion。旧记录通过显式迁移生成不可变内容对象、回填引用并清空旧正文值；兼容列不再产生正文存储成本。
- ChangeRecord 的 `commitId`、`status` 索引已经完成。提交序号仍采用“查询最大值再加一”且没有唯一冲突重试。
- 全库显式迁移已经完成：静态基线覆盖全部实体表和索引，增量迁移负责旧数据转换；空库创建、旧库升级和 Entity/schema 零差异都有原生测试。

下一步：将局部编辑的 Diff 卡片接入 AI 消息。不实现编辑页行号；富文本会随 DOM 宽度自动换行，视觉行号不能作为稳定定位信息。

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
- 所有业务表使用同一静态基线与增量迁移账本，TypeORM `synchronize` 已关闭。

当前进度：已支持带格式版本号和整体 SHA-256 摘要的 JSON 版本包，包含方案/检查点 Ref 与 Commit、Change、Tree、Content 对象。导入会复验包摘要和全部内容寻址对象，只接受同一世界且当前历史为版本包前缀的情况；已有历史下导入为非活动方案，不覆盖当前工作区。全局 GC 在完整性检查通过后只清理任何提交都不可达的 Tree/Content。密码学签名、远端协商和对象压缩尚未实现。

### 已完成：面向提交的操作

- `restore`：把整个世界、文档或目录恢复到旧状态并创建新提交。
- `revert`：反向应用某次提交涉及的文档状态并创建新提交。
- `cherry-pick`：把某次提交涉及的文档状态摘取到当前方案并创建新提交。
- 三者都校验当前活动方案 HEAD；旧提交、分支和检查点保持不可变。

## P0：Markdown 编辑工具包

当前进度：

- `replace_text` 已完成：仅唯一原文匹配时写入，零次/多次匹配返回结构化可恢复错误。
- `replace_section` 已完成：使用标题路径定位，使用章节 hash 防止过期覆盖。
- 两者均复用 revision、ChangeSet、EffectReceipt 和文档版本事务，返回语义定位锚点、增删统计与 `diffRef`。
- 历史 Diff 已改为上下文 Hunk；删除使用浅红背景，新增使用浅绿背景，不展示行号。Renderer 已抽出共用 Diff 卡片。
- 历史 Diff Hunk 已支持点击定位：依次使用新增内容、现存上下文和标题路径定位 TipTap 节点，滚动后短暂高亮。锚点已失效时明确提示，不猜测跳转。
- 已通过 Node/Web 类型检查、工具合同、工具注册、文档 Diff 和 Agent 场景回归。

### 下一轮编辑工具审计（2026-08-19）

当前 `update_world_document` + `replace_text` + `replace_section` 已能覆盖全文、片段和章节编辑。下一阶段不按旧清单一次性扩张所有工具，先闭合已有能力，再增加高频操作。

P0：闭合已有局部编辑（主体完成）

- `diffRef` 已具备 Main、Preload 和 Renderer 读取闭环，并从不可变内容版本重建 Diff。
- AI 最终消息已持久化轻量 Diff 引用；对话中可展开共用 Diff 卡片，在编辑页可按语义锚点定位修改。
- `replace_section` 已同时使用标题路径和 section hash 选择目标，支持同路径下的重复标题章节。
- 局部编辑回执不再携带整篇 Markdown，只返回文档摘要、revision、锚点和 Diff 引用；版本 GC 会保留已被工具回执引用的内容版本。
- Markdown 编辑引擎、Diff 和 TipTap 定位已共用可见文本锚点规范，覆盖标题、列表、任务项、粗体、链接、实体和空白差异。

P1：补齐高频操作（已完成）

- `insert_text` 通过 `before | after` 在唯一 Markdown 锚点前后插入，零次或多次匹配返回结构化冲突。
- `append_text` 在文档末尾追加一个 Markdown 块，不再要求回传整篇正文。
- `read_document_section` 按标题路径读取章节；重复路径使用可选 section hash 消歧，并与 `replace_section` 共享定位规则。

连续编辑上下文（已完成）

- 每次局部编辑向下一次模型调用返回权威新 revision、操作摘要和仍然有效的定位信息，不回显整篇正文。
- 展示用可见锚点与再次编辑用 Markdown 原文锚点分离；只有结果文档中唯一的原文锚点才允许继续使用。
- 同一文档较新的 continuation 会替代旧 revision 提示，执行账本和 receipt 仍保存本轮已完成的全部操作。
- revision、章节 hash 或锚点冲突时要求重新读取目标范围，不允许沿用过期状态猜测写入。

P2：根据实测再决定

- 多处编辑原子聚合：当真实任务经常出现“第一处已写入、后续操作失败”时，再引入单文档批量预检和一次提交。
- 普通可恢复编辑不强制“预览→应用”两步；只在全文或大范围改写出现真实需求时再增加。
- 暂不增加 `rewrite_document`，现有 `update_world_document` 已覆盖全文重写。
- 暂不增加通用 Patch；现有语义编辑尚未显示出需要重型协议的瓶颈。
- Agent 撤销工具暂缓，当前先依赖版本历史和人工恢复。

所有后续编辑操作继续返回新 revision、语义定位锚点、Diff 摘要和可恢复的结构化错误。内部共享同一套 Markdown 编辑引擎，Agent 入口不暴露 HTML、数据库字段或内部节点 ID。

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

换设备后从上述 P0 开始：先建立 `diffRef` 读取闭环，再接入 AI Diff 卡片，然后修正重复章节和锚点规范化。P0 完成后再实现 `insert_text`、`append_text` 和按章节读取。
