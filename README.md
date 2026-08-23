# PromptPilot

一键向网页版 AI 注入提示词的 Chrome 扩展。

## 功能特性

- **一键注入** — 将提示词快速注入到 ChatGPT、Claude、Gemini 等 AI 对话输入框
- **模板变量** — 使用 `{{变量名}}` 或 `{{变量名:默认值}}` 创建可复用的提示词模板，注入时动态填写
- **分类管理** — 按写作、编程、翻译等分类组织提示词，支持自定义分类
- **搜索过滤** — 按标题、内容、标签快速搜索
- **置顶收藏** — 常用提示词置顶显示
- **使用统计** — 记录每条提示词的使用次数
- **快捷键** — `Ctrl+Shift+P`（Mac: `⌘+Shift+P`）在页面中快速唤起浮动面板
- **浮动工作台** — 支持拖拽移动、左右贴边吸附和四边八角调整大小，尺寸自动保存
- **侧边栏** — 在浏览器侧边栏中使用完整的提示词管理界面，窗口高度自动适配
- **主题同步** — 插件弹窗、侧边栏和浮动面板共享明暗主题设置
- **线性图标** — 使用本地 Lucide 图标，避免依赖网络资源和 emoji 按钮
- **导入导出** — JSON 格式备份与恢复，支持增量合并
- **数据持久化** — 基于 `chrome.storage.local` 存储，关闭浏览器数据不丢失

## 支持的 AI 平台

| 平台     | 域名                          |
| -------- | ----------------------------- |
| ChatGPT  | chatgpt.com / chat.openai.com |
| Claude   | claude.ai                     |
| Gemini   | gemini.google.com             |
| DeepSeek | chat.deepseek.com             |
| 通义千问 | tongyi.aliyun.com             |
| Kimi     | kimi.moonshot.cn              |
| 文心一言 | chat.baidu.com                |
| 智谱清言 | chat.zhipu.ai                 |
| 豆包     | www.doubao.com                |

未在列表中的平台会自动尝试查找通用输入框（`contenteditable`、`textarea` 等）。

## 安装

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」，选择本项目目录
4. 扩展图标出现在工具栏，点击即可使用

## 使用方法

### 基本操作

1. 点击扩展图标打开弹窗
2. 点击添加按钮创建提示词
3. 点击提示词右侧的注入按钮，将内容注入当前 AI 页面
4. 点击侧边栏按钮，在浏览器侧边栏中打开完整管理界面

### 浮动面板

在支持的平台页面中，浮动球会自动显示：

- 轻点浮动球打开或关闭快速选择面板
- 按住浮动球拖动，松开后自动吸附到左侧或右侧
- 将鼠标移动到面板四周或四角，按住并拖动即可调整大小
- 面板最小尺寸为 `200 × 150`，调整后的位置和尺寸会自动保存
- 拖动超过 5px 才会被识别为拖拽，避免轻点误触

### 模板变量

在提示词内容中使用双花括号语法：

```
请将以下内容翻译为{{目标语言:英语}}：

{{待翻译内容}}
```

注入时，扩展会弹出表单让你填写变量值，支持实时预览。

### 快捷键

按下 `Ctrl+Shift+P` 可在 AI 页面中直接唤起浮动选择面板，无需点击扩展图标。

### 数据管理

在设置面板中可以：

- **导出** — 将所有提示词和分类导出为 JSON 文件
- **导入** — 从 JSON 文件恢复数据（增量合并，不覆盖已有数据）
- **重置预设** — 恢复内置的预设分类和提示词模板

### 主题

点击主题按钮可以切换明暗主题。主题设置会同步应用到插件弹窗、侧边栏和当前页面中的浮动面板。

## 项目结构

```
prompts/
├── manifest.json          # 扩展清单（Manifest V3）
├── background.js          # Service Worker，处理快捷键命令
├── lib/                   # 第三方库
│   ├── nanoid.js          # nanoid — 唯一 ID 生成
│   ├── purify.min.js      # DOMPurify — HTML 安全转义/净化
│   ├── lucide.min.js      # Lucide — 线性图标
│   ├── sortable.min.js     # SortableJS — 拖拽排序
│   ├── draggabilly.js      # Draggabilly — 拖拽基础库
│   └── unidragger.js       # Unidragger — 指针事件处理
├── shared/                # 共享模块
│   ├── utils.js           # 工具函数（模板解析、HTML转义、ID生成）
│   └── defaults.js        # 默认数据（预设分类和提示词）
├── content/               # 内容脚本
│   ├── inject.js          # 注入引擎（查找输入框、设置值、发送）
│   └── panel.js           # 浮动面板（页面内快速选择 UI）
├── popup/                 # 弹窗
│   ├── popup.html         # 弹窗页面
│   ├── popup.css          # 弹窗样式
│   ├── storage.js         # 数据层（所有 chrome.storage 操作）
│   ├── render.js          # 视图层（DOM 渲染）
│   ├── editor.js          # 交互层（编辑器/模板/设置弹窗）
│   └── app.js             # 入口（状态管理、事件绑定、初始化）
├── dragtest.js             # Draggabilly 初始化测试
├── package.json            # npm 依赖和开发依赖
├── package-lock.json       # 依赖锁定文件
├── .gitignore              # 本地依赖和开发文件忽略规则
└── icons/                  # 扩展图标
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## 技术栈

- Chrome Extension Manifest V3
- 原生 JavaScript + 第三方库（nanoid / DOMPurify / SortableJS / Draggabilly / Lucide）
- Chrome Storage API（本地持久化）
- Content Script 注入机制
- Chrome Side Panel API

## 开发检查

运行拖拽依赖测试：

```bash
node dragtest.js
```

检查脚本语法：

```bash
node --check content/panel.js
node --check popup/app.js
node --check popup/render.js
```

## License

MIT