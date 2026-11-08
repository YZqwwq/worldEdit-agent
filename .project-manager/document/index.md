# WorldEdit 项目管理文档

## 现有知识入口

- [项目用途](../../project-docs/project-description.md)：沿用已有用途说明。
- [现状概览及阅读覆盖](../../project-docs/index.md)：沿用已有文档索引；本次接入的核对范围见该文件顶部，旧记录保留历史日期。
- [AI agent 设计](../../project-docs/document/ai-agent-design/catalog.md)
- [世界观创作](../../project-docs/document/worldbuilding-creation/catalog.md)
- [持久化与共享](../../project-docs/document/data-structure-persistence-and-sharing/catalog.md)
- [前端界面与交互](../../project-docs/document/frontend-interface-and-interaction/catalog.md)
- [首页样式资源协议](../../src/renderer/src/features/home/README.md)：已有专题说明，按相关任务读取。
- [当前待办入口](../../temp-plan/README.md)：保留其计划性质；不是本次接入新增的实施授权。
- [开发设计资料](../../developmentlog/README.md)：含历史设计与说明，不能据此认为实现已复核。

## 文档维护方式

沿用 project-docs 的功能文档及覆盖索引，不另外创建同内容的 current/、goals.md 或 roadmap.md。已有功能变化时更新对应文档与受影响索引；新功能建档、完整整理按 document-rules 的任务边界执行。普通任务不预读整个文档库。

project-docs 当前被根 .gitignore 的 /project-docs 规则排除，是本地已有知识目录。本次保留该设置，未迁移、强制加入 Git 或复制这些文档。新检出环境若缺少此目录，须明确报告入口缺失，并从 README、主要配置及当前任务相关源码重建最小理解，不能假装加载过旧文档。

## 本次覆盖与交接

2026-09-19：使用本地 project-manager 接入 AGENTS.md、agent.md、document-rules 和 skill-rules，并读取新增入口。本次只做浅层接入，沿用已有四个功能模块，未逐功能复核。

已读：根 README、package.json、electron.vite.config.ts、主进程 src/main/index.ts 的启动段、renderer 路由、project-docs 用途与索引、前端 catalog、developmentlog 与 temp-plan 入口、首页资源 README。结合上一任务已读 AppTitleBar.vue、useHomeStyle.ts、HomeStylePreview.vue，登记首页样式现状；上一任务的 vue-tsc 通过不等于整套应用已验证。

未验证：AI 运行链、数据迁移、复杂恢复和资源协议的端到端运行；旧功能文档与现实现的一致性；Codex 新会话的实际规则加载。本次不运行业务测试、不修改产品逻辑，也不把历史待办自动转成当前任务。

接入前工作区已有首页样式、测试脚本、截图、临时计划等未提交变更；保持原样。后续从当前任务涉及的模块入口继续，不默认恢复旧索引中的阅读待办。
