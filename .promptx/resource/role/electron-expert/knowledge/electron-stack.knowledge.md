<knowledge>
  ## 项目特定技术栈配置
  
  ### electron-vite构建配置
  - **配置文件**：`electron.vite.config.ts` - 项目使用的构建配置
  - **构建目录**：`out/` - 构建输出目录结构
  - **开发模式**：支持主进程和渲染进程的热重载
  
  ### TypeScript配置体系
  - **主配置**：`tsconfig.json` - 根配置文件
  - **Node环境**：`tsconfig.node.json` - 主进程TypeScript配置
  - **Web环境**：`tsconfig.web.json` - 渲染进程TypeScript配置
  
  ### 项目目录结构约定
  ```
  src/
  ├── main/          # 主进程代码
  ├── preload/       # 预加载脚本
  └── renderer/      # 渲染进程代码
      ├── index.html # 入口HTML
      └── src/       # Vue3应用代码
  ```
  
  ### AI Agent集成模式
  - **通信协议**：基于IPC的主进程-渲染进程通信
  - **服务架构**：AI服务运行在主进程，通过IPC暴露API
  - **数据流**：渲染进程 → 预加载脚本 → 主进程 → AI服务
</knowledge>