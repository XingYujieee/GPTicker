# GPTicker

GPTicker 是一个面向 ChatGPT 网页端的 Chrome 扩展，用来把长对话变成一个可导航、可标记、可导出的知识工作区。

它通过 Shadow DOM 将独立侧栏注入 `chatgpt.com` / `chat.openai.com` 页面，在不污染原页面样式的前提下，提供对话导航、关键词抽取、Prompt Vault、会话标签、Markdown 导出，以及 2D / 3D 双模态知识视图。

## 项目定位

GPTicker 的核心目标不是“替代 ChatGPT”，而是增强 ChatGPT 在长会话场景下的可读性、可检索性和可回溯性。

当前的双模态导航分成两条路径：

- `2D 拓扑`：指引当前对话的逻辑方向
- `3D 全景`：映射并折射当前对话的知识全景

这两个模式面向的是两种不同的浏览习惯：

- 当你想快速梳理结构、主线、关键词关系时，看 2D
- 当你想从整体空间感知角度浏览知识簇、热点、关联时，看 3D

## 功能概览

### 1. Minimap 对话导航

- 右侧固定 minimap
- `Q` 模式：优先显示你的提问
- `All` 模式：显示全部消息
- 点击节点按顶部偏移锚点定位到对应消息块
- 页面滚动时自动同步高亮当前消息
- hover 显示摘要预览

### 2. 2D 拓扑视图

基于 ECharts Graph 的逻辑图，用来表达：

- 会话标题
- 高频关键词
- 关键词与消息之间的连接关系

这个模式更偏“逻辑梳理”，适合回答：

- 当前对话围绕哪些关键词展开
- 关键词挂接了哪些消息
- 结构主线是什么

### 3. 3D 知识全景

基于 React Three Fiber + Three.js 的 3D 视图，用来表达：

- 关键词点云
- 关键词簇
- 星座连线
- 景深标签
- 空间化知识浏览

当前支持：

- OrbitControls 旋转 / 缩放
- 点击点切换关键词过滤
- 点击点后将该点作为新的旋转关注中心
- 标签跟随点位
- Bloom 光晕
- 星空氛围背景

### 4. Keyword Cloud

- 从当前对话中提取高频关键词
- 支持多关键词组合过滤
- 与 minimap、2D、3D 视图联动

### 5. Prompt Vault

- 本地保存常用提示词
- 支持新增、编辑、删除
- 支持复制
- 支持一键填入 ChatGPT 输入框
- 支持自动发送
- 会按当前会话标签优先推荐相关指令

### 6. 会话标签与导出

- 支持给当前会话打标签
- 标签保存在 `chrome.storage.local`
- 支持导出 Markdown
- 导出内容包含基础 metadata 与正文

### 7. 可拖动 / 可折叠侧栏

- 侧栏可最小化
- 可在页面中自由拖动
- 状态与位置会持久化

### 8. DOM 稳健性策略

针对 ChatGPT DOM 结构经常变化的问题，项目实现了：

- 语义化选择器优先
- fallback selector map
- selector health check
- 缺失节点的降级提示

## 技术栈

- React 18
- TypeScript
- Vite
- Tailwind CSS
- ECharts
- React Three Fiber
- Three.js
- `chrome.storage.local`
- Shadow DOM

## 运行环境

- Node.js 18+
- npm
- Chrome / Edge（开发者模式加载 unpacked extension）

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 构建扩展

```bash
npm run build
```

构建产物会输出到：

```text
dist/
```

### 3. 在浏览器中加载

Chrome：

1. 打开 `chrome://extensions`
2. 打开右上角“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择项目里的 `dist` 目录

Edge：

1. 打开 `edge://extensions`
2. 开启开发者模式
3. 加载 `dist`

### 4. 打开 ChatGPT

进入以下站点的对话页：

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`

扩展会自动注入侧栏。

## 开发命令

### 实时构建

```bash
npm run dev
```

说明：

- 这个命令本质上是 `vite build --watch`
- 更适合扩展场景，不是传统 dev server

### 类型检查

```bash
npm run typecheck
```

### 生产构建

```bash
npm run build
```

### 包体分析

```bash
npm run analyze
```

## 目录结构

```text
GPTicker/
├── public/
│   ├── content-loader.js
│   └── manifest.json
├── scripts/
│   └── analyze.mjs
├── src/
│   ├── content/
│   │   ├── bootstrap.tsx
│   │   ├── observer.ts
│   │   ├── viewport.ts
│   │   ├── selectors.ts
│   │   ├── selector-health.ts
│   │   ├── chat-actions.ts
│   │   ├── export-markdown.ts
│   │   └── session.ts
│   ├── shared/
│   │   ├── storage.ts
│   │   ├── tags.ts
│   │   ├── types.ts
│   │   └── utils.ts
│   └── ui/
│       ├── App.tsx
│       ├── hooks/
│       │   └── use-gpticker-state.ts
│       └── components/
│           ├── sidebar-shell.tsx
│           ├── minimap-dots.tsx
│           ├── logic-graph-2d.tsx
│           ├── point-cloud-3d.tsx
│           ├── point-cloud-3d-runtime.tsx
│           ├── prompt-vault-panel.tsx
│           ├── session-context-panel.tsx
│           ├── session-tag-strip.tsx
│           └── word-cloud.tsx
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── vite.config.ts
```

## 架构说明

### 内容脚本层

内容脚本负责：

- 监听 `main`
- 扫描并提取 `article`
- 建立消息节点与 DOM 元素映射
- 管理滚动定位
- 管理 selector health
- 注入 Shadow DOM 宿主

关键文件：

- [bootstrap.tsx](/Users/xingyujie/Desktop/code/GPTicker/src/content/bootstrap.tsx)
- [observer.ts](/Users/xingyujie/Desktop/code/GPTicker/src/content/observer.ts)
- [selectors.ts](/Users/xingyujie/Desktop/code/GPTicker/src/content/selectors.ts)
- [viewport.ts](/Users/xingyujie/Desktop/code/GPTicker/src/content/viewport.ts)

### UI 层

React UI 负责：

- minimap 交互
- 2D / 3D 双模态导航
- Prompt Vault
- 会话标签
- 关键词过滤
- 预览与反馈

关键文件：

- [App.tsx](/Users/xingyujie/Desktop/code/GPTicker/src/ui/App.tsx)
- [sidebar-shell.tsx](/Users/xingyujie/Desktop/code/GPTicker/src/ui/components/sidebar-shell.tsx)
- [logic-graph-2d.tsx](/Users/xingyujie/Desktop/code/GPTicker/src/ui/components/logic-graph-2d.tsx)
- [point-cloud-3d-runtime.tsx](/Users/xingyujie/Desktop/code/GPTicker/src/ui/components/point-cloud-3d-runtime.tsx)

### 存储层

所有用户态数据都走 `chrome.storage.local`，包括：

- Prompt Vault
- 会话标签
- 侧栏位置
- 最小化状态

关键文件：

- [storage.ts](/Users/xingyujie/Desktop/code/GPTicker/src/shared/storage.ts)
- [tags.ts](/Users/xingyujie/Desktop/code/GPTicker/src/shared/tags.ts)

## Manifest 与权限

当前扩展使用 Manifest V3：

- [public/manifest.json](/Users/xingyujie/Desktop/code/GPTicker/public/manifest.json)

权限：

- `storage`

匹配站点：

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`

## 当前交互细节

- minimap 点击定位到消息顶部锚点，而不是居中
- 2D / 3D 都支持关键词联动
- 3D 标签跟随点位
- 3D 旋转中心可跟随点击点更新
- 侧栏可拖动、可最小化
- Prompt 可写入输入框并触发 React input 事件

## 已知限制

### 1. ChatGPT DOM 仍可能漂移

虽然已经做了 fallback selector 和 health check，但 ChatGPT 页面结构是会变的。  
如果 OpenAI 调整消息结构、输入框结构或滚动容器，部分功能仍可能需要跟进修复。

### 2. 3D 包体较大

当前 3D 运行时包含：

- `three`
- `@react-three/fiber`
- `@react-three/drei`
- `@react-three/postprocessing`

因此 `point-cloud-3d-runtime.js` 体积仍然偏大，构建时会出现 Vite 的 chunk warning。  
这不影响本地加载和使用，但如果后续继续发布，仍建议进一步拆包或裁剪 3D 能力。

### 3. 自动化测试仍未补齐

当前以真实页面调试和功能验证为主，还没有系统性的自动化测试覆盖。

## 推荐后续优化方向

- 为 3D 视图增加更成熟的银河背景和雾带动画
- 继续优化 3D 标签密度与遮挡策略
- 增加截图、GIF 或 demo 视频
- 增加书签 / 最近跳转记录
- 补充自动化测试
- 增加 GitHub Actions 构建流程

## 发布约定

当前仓库的发布约定已经确定如下：

1. 已补充 `MIT LICENSE`
2. 保留 `dist/` 与 `dist.zip`
3. 暂不补 README 截图
4. 已清理本地缓存文件，并在 `.gitignore` 中忽略
5. 已增加 `.github/workflows/build.yml` 构建工作流

## 致谢

这个项目围绕 ChatGPT 长对话导航、知识可视化和提示词工作流展开，强调三件事：

- 不打断原有聊天体验
- 不污染原页面样式
- 让长对话变得可浏览、可回看、可沉淀

如果你也在做类似方向，这个仓库可以直接作为继续扩展的起点。
