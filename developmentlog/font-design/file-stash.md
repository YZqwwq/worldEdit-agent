# 文件系统设计记录

## 当前目标

当前 Electron 应用的文件系统设计目标不是做一个通用文件仓库，而是围绕以下几类资源建立稳定的运行时存储：

1. 应用运行时静态文件
2. 对话上传附件
3. 头像图片与头像配置
4. prompt / persona / history 一类的数据文件

核心原则是：

- 静态资源与业务数据分层
- 不同用途的静态文件分目录存放
- 通过主进程统一读写
- 通过主进程统一资源协议对外提供读取能力
- 通过路径函数集中生成路径，避免散落硬编码
- 通过显式校验保证“引用正确”与“删除安全”

---

## 当前目录结构

### 1. 运行时静态目录

当前应用启动后，会在：

`app.getPath('userData')/static`

下自动创建运行时静态目录。

当前已使用的子目录：

- `static/uploads`
  用于存放对话过程中的上传附件
- `static/avatars`
  用于存放头像图片
- `static/avatars/profiles.json`
  用于存放头像与参与者之间的映射关系，以及头像缩放、偏移等配置

这些目录本身是磁盘目录，但渲染层不会直接依赖磁盘绝对路径。

对渲染层暴露时，当前统一转换为：

- `app-resource://uploads/...`
- `app-resource://avatars/...`

这一层目录由以下方法负责：

- `getRuntimeStaticRoot()`
- `getStaticUploadDir()`
- `getStaticAvatarDir()`
- `getAvatarProfilesPath()`

代码位置：

- `src/main/config/pathConfig.ts`

---

### 2. 数据型 prompt / persona / history 目录

应用运行时数据 prompt 目录位于：

`app.getPath('userData')/prompt-resource/famila-daily`

这一层主要用于：

- persona state
- history state
- short term memory
- history raw/compressed markdown

相关方法：

- `getDataPromptResourceRoot()`
- `getDataFamilaDailyRoot()`
- `getPersonaStatePath()`
- `getHistoryStatePath()`
- `getShortTermPath()`
- `getHistoryRawPath()`
- `getHistoryCompressedPath()`

这一层和 `static` 是分开的：

- `prompt-resource/...` 更偏“结构化数据 / 状态文件”
- `static/...` 更偏“文件资源本体”

---

## 为什么要把不同用途静态文件分目录

当前设计已经明确把静态文件分为：

### `static/uploads`

作用：

- 用户在对话中上传的原始附件

特点：

- 生命周期偏短
- 可能批量清空
- 可能被删除或重传

### `static/avatars`

作用：

- 头像图片
- 头像配置文件 `profiles.json`

特点：

- 生命周期偏长
- 会被频繁展示
- 会与参与者身份绑定
- 不应和普通附件混在一起

### 为什么不能混放

如果把头像和普通上传文件都丢进同一个目录，会带来几个问题：

1. 清理时难以区分哪些是聊天附件，哪些是头像资源
2. 后续做导出、迁移、备份时语义不清
3. 头像通常需要伴随配置文件，而附件通常不需要
4. 文件生命周期不同，后期维护会混乱

因此当前方案是：

`按用途分目录，而不是按文件类型分目录`

也就是说，不是“图片一目录、文本一目录”，而是“头像一目录、上传附件一目录”。

---

## 当前存取方式

## 1. 上传附件如何存

前端不会直接写磁盘，而是调用 preload 暴露的：

- `window.api.pickFile()`
- `window.api.uploadFile(sourcePath)`

主进程 IPC 在：

- `src/main/services/aiservice/aiIpc.ts`

关键流程：

1. 渲染进程先拿到用户选择的原始文件路径
2. 主进程通过 `copyToUploadDir(sourcePath)` 复制文件
3. 文件被写入 `static/uploads`
4. 文件名使用 `randomUUID()` 重命名，避免冲突
5. 主进程通过统一资源协议把磁盘文件映射为 `app-resource://uploads/...`
6. 返回 `resourceUrl` 给前端，而不是返回磁盘绝对路径

关键方法：

- `copyToUploadDir(sourcePath)`
- `getStaticUploadDir()`
- `buildAppResourceUrl('uploads', filePath)`

---

## 2. 头像如何存

头像编辑器当前在前端得到的是：

- data URL 图片内容
- `avatarScale`
- `avatarOffsetX`
- `avatarOffsetY`

前端通过 preload 调用：

- `window.api.saveAvatarProfile(...)`
- `window.api.getAvatarProfiles()`

主进程头像服务位于：

- `src/main/services/avatar/avatarProfileService.ts`

关键流程：

1. 前端上传图片后，编辑器得到 data URL
2. 调用 `avatar:saveProfile`
3. 主进程用 `saveAvatarDataUrl()` 将 data URL 解码并写入 `static/avatars`
4. 头像文件名使用：
   - 参与者 key
   - `randomUUID()`
5. 同时把缩放和偏移参数写入 `profiles.json`
6. 主进程通过统一资源协议把头像文件映射为 `app-resource://avatars/...`
7. 下次启动时通过 `getProfiles()` 重新加载

关键方法：

- `saveProfile(input)`
- `getProfiles()`
- `saveAvatarDataUrl(participantKey, dataUrl)`
- `getAvatarProfilesPath()`
- `getStaticAvatarDir()`
- `buildAppResourceUrl('avatars', filePath)`
- `resolveAvatarPathFromUrl(...)`

当前保存的不是“裁切后的最终圆形图片”，而是：

- 原始头像图片文件
- 配套的变换参数

这样做的好处是后续还可以继续调整头像，而不是一次裁切后不可逆。

---

## 3. 启动时如何创建目录

初始化入口在：

- `src/main/config/storageInit.ts`

当前启动时会调用：

- `getRuntimeStaticRoot()`
- `getStaticUploadDir()`
- `getStaticAvatarDir()`

也就是说，应用启动后运行时静态目录一定存在，不需要等到第一次上传文件或第一次设置头像时才补建。

---

## 当前统一资源协议

### 为什么要建立统一资源协议

在 Electron 中，如果渲染层直接依赖：

- 磁盘绝对路径
- `file://...`
- 或把图片直接转成 `data:` 内联

都会带来问题：

1. 开发态与打包态行为不够统一
2. 本地文件 URL 受权限与 CSP 影响较大
3. 前端会间接持有真实磁盘路径，边界不够清晰
4. 不同资源的读取方式容易分叉

因此当前改为：

`主进程保存真实文件，渲染层只消费 app-resource:// 资源地址`

---

### 协议设计

当前在主进程注册了统一协议：

- `app-resource://`

已使用的 bucket：

- `app-resource://uploads/...`
- `app-resource://avatars/...`

协议模块位置：

- `src/main/protocols/resourceProtocol.ts`

关键方法：

- `registerAppResourceProtocol()`
- `buildAppResourceUrl(bucket, filePath)`
- `resolveAppResourcePath(resourceUrl, expectedBucket?)`

主进程启动时在：

- `src/main/index.ts`

调用：

- `registerAppResourceProtocol()`

这样渲染层访问头像或附件时，请求会先进入主进程协议，再由主进程映射到受控静态目录中的真实文件。

---

### 协议如何保证稳定

当前协议不是把任意本地路径暴露出来，而是只允许访问我们定义好的资源 bucket。

也就是说：

- `avatars` 只能映射到 `static/avatars`
- `uploads` 只能映射到 `static/uploads`

协议解析时会做：

1. 解析 URL 中的 bucket
2. 解析相对路径
3. 拼出真实磁盘路径
4. 校验路径必须仍然位于该 bucket 对应目录内

如果路径越界，协议会直接拒绝访问。

这一步的核心是：

- `isPathInsideRoot(rootDir, targetPath)`
- `relative(...)`
- `resolve(...)`

---

### CSP 配合

因为渲染层页面本身使用了 CSP，所以在建立统一资源协议后，还需要允许图片加载这个新协议。

当前已经在：

- `src/renderer/index.html`

中将：

- `img-src 'self' data:`

扩展为：

- `img-src 'self' data: app-resource:`

这一步很重要，否则即使协议注册成功，浏览器层也会因为 CSP 拒绝加载头像图片。

---

## 涉及的关键方法一览

### 路径与目录生成

位于 `src/main/config/pathConfig.ts`

- `ensureDir(dir)`
- `getRuntimeStaticRoot()`
- `getStaticUploadDir()`
- `getStaticAvatarDir()`
- `getAvatarProfilesPath()`
- `getDataFamilaDailyRoot()`
- `resolveDataFilePath(...)`

### 目录迁移

位于 `src/main/config/pathConfig.ts`

- `migrateLegacyFile(...)`
- `migrateLegacyDir(...)`
- `getLegacyFamilaDailyRoots()`

当前已实现的迁移包括：

- 旧 `prompt-resource/famila-daily/...` 文件迁移到 userData 数据目录
- 旧 `static-uploads` 目录迁移到新的 `static/uploads`

### 上传附件

位于 `src/main/services/aiservice/aiIpc.ts`

- `copyToUploadDir(sourcePath)`
- `clearUploadFiles()`
- `ipcMain.handle('file:upload', ...)`
- `ipcMain.handle('file:delete', ...)`

### 头像配置

位于 `src/main/services/avatar/avatarProfileService.ts`

- `readProfiles()`
- `writeProfiles(...)`
- `saveProfile(...)`
- `getProfiles()`
- `clearAll()`
- `saveAvatarDataUrl(...)`
- `removeAvatarFile(...)`

### 统一资源协议

位于 `src/main/protocols/resourceProtocol.ts`

- `registerAppResourceProtocol()`
- `buildAppResourceUrl(...)`
- `resolveAppResourcePath(...)`
- `isPathInsideRoot(...)`

---

## 如何确定引用正确

这里的“引用正确”分为两层。

## 1. 路径解析正确

路径不是直接在业务代码里拼字符串，而是通过统一方法生成；渲染层拿到的也不是磁盘路径，而是受控协议地址。

例如：

- `getStaticUploadDir()`
- `getStaticAvatarDir()`
- `getAvatarProfilesPath()`

这样可以保证：

1. 所有调用方拿到的是同一套目录规则
2. 打包态与开发态行为一致
3. 后续目录结构变化时，只需改路径层
4. 渲染层不需要感知真实磁盘位置

### prompt 资源的正确引用

静态 prompt 资源使用：

- `pickExisting(candidates)`

它会从多个候选路径里选择真正存在的那个路径。

这用于解决：

- 开发环境路径
- 打包环境路径
- 旧路径兼容

### 数据文件的正确引用

数据文件使用：

- `resolveDataFilePath(relativeParts, legacyCandidates)`

它会：

1. 先在 userData 数据目录下生成目标路径
2. 自动 `ensureDir`
3. 若目标不存在，则尝试从 legacy 位置迁移

因此“引用正确”不只是拿到路径，还包括：

- 目标目录已存在
- 历史文件可回迁
- 调用方拿到的是最终稳定路径

### 资源 URL 的正确引用

当前附件和头像对渲染层暴露时，都会先经过：

- `buildAppResourceUrl(...)`

所以渲染层最终引用的是：

- `app-resource://uploads/...`
- `app-resource://avatars/...`

这意味着“引用正确”现在多了一层要求：

1. 真实文件路径正确
2. 真实文件位于受控目录内
3. 主进程能把它稳定映射为合法资源 URL
4. 渲染层只使用这个资源 URL，而不是自行拼接本地路径

---

## 2. 文件访问安全正确

除了路径能找到，还要保证不会误删、误读、误引用其他目录文件。

### 上传文件删除校验

在 `aiIpc.ts` 中，删除上传文件时使用：

- `resolveAppResourcePath(resourceUrl, 'uploads')`

只有当目标资源 URL 能被解析，并且确实落在 `static/uploads` 下时，才允许删除。

这解决的是：

- 防止传入任意路径删系统文件
- 防止删到别的业务目录
- 防止把头像 URL 当成附件 URL 删除

### 头像文件校验

在 `avatarProfileService.ts` 中，使用：

- `resolveAvatarPathFromUrl(...)`
- `isInsideAvatarDir(path)`

只有头像目录内部的文件才会被当成合法头像文件处理或删除。

也就是说，头像引用“正确”的判定标准不只是 URL 可用，而是：

1. 能被解析成真实文件路径
2. 真实路径位于 `static/avatars` 内部
3. 如果传入的是 `app-resource://avatars/...`，也必须能被安全还原

---

## 当前结论

当前项目的文件系统已经形成了如下边界：

### 静态文件边界

- `static/uploads` 只管对话上传附件
- `static/avatars` 只管头像图片与头像配置

### 资源读取边界

- 渲染层统一读取 `app-resource://...`
- 主进程统一把资源 URL 映射到受控静态目录
- 前端不再依赖 `file://...`
- 前端不再依赖头像 `base64` 作为长期读取方案

### 数据文件边界

- `prompt-resource/famila-daily/...` 负责 persona / history 等结构化状态文件

### 存取边界

- 渲染层不直接写磁盘
- 渲染层不直接读取磁盘绝对路径
- 一律经由 preload -> ipcMain -> main service

### 正确性边界

- 路径统一由 pathConfig 生成
- 旧文件通过迁移逻辑兼容
- 资源访问通过 `app-resource://` 协议统一暴露
- 删除与引用通过 `resolveAppResourcePath / isInsideAvatarDir / isPathInsideRoot` 校验

---

## 后续可扩展方向

如果后续静态资源继续增多，建议继续按用途扩展目录：

- `static/uploads`
- `static/avatars`
- `static/exports`
- `static/temp`
- `static/cache`

仍然保持原则：

`按用途分目录，而不是按文件类型分目录`
