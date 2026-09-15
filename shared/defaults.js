var PromptDefaults = {
  CATEGORIES: [
    {
      id: "cat_writing",
      name: "写作",
      icon: "📝",
      order: 0,
      isPreset: true,
      createdAt: Date.now(),
    },
    {
      id: "cat_coding",
      name: "编程",
      icon: "💻",
      order: 1,
      isPreset: true,
      createdAt: Date.now(),
    },
    {
      id: "cat_translate",
      name: "翻译",
      icon: "🌐",
      order: 2,
      isPreset: true,
      createdAt: Date.now(),
    },
    {
      id: "cat_creative",
      name: "创意",
      icon: "🎨",
      order: 3,
      isPreset: true,
      createdAt: Date.now(),
    },
    {
      id: "cat_analysis",
      name: "分析",
      icon: "📊",
      order: 4,
      isPreset: true,
      createdAt: Date.now(),
    },
    {
      id: "cat_custom",
      name: "自定义",
      icon: "⚙️",
      order: 5,
      isPreset: true,
      createdAt: Date.now(),
    },
  ],

  PROMPTS: [
    {
      id: "preset_code_review",
      title: "代码审查",
      content:
        "请审查以下代码，从以下几个方面进行分析：\n1. 代码质量和可读性\n2. 潜在的 Bug 和安全问题\n3. 性能优化建议\n4. 最佳实践建议\n\n{{编程语言:自动检测}}代码如下：\n```\n{{代码内容}}\n```",
      tags: ["编程", "审查"],
      categoryId: "cat_coding",
      pinned: true,
      usageCount: 0,
      isPreset: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: "preset_bug_fix",
      title: "Bug 修复助手",
      content:
        "我在{{编程语言}}代码中遇到了一个 Bug，请帮我分析和修复：\n\n**问题描述**：{{问题描述}}\n\n**期望行为**：{{期望行为}}\n\n**实际行为**：{{实际行为}}\n\n**相关代码**：\n```\n{{代码片段}}\n```",
      tags: ["编程", "调试"],
      categoryId: "cat_coding",
      pinned: false,
      usageCount: 0,
      isPreset: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: "preset_translate",
      title: "翻译助手",
      content:
        "请将以下内容翻译为{{目标语言:英语}}，保持{{风格:专业}}的语气，确保翻译准确自然：\n\n{{待翻译内容}}",
      tags: ["翻译"],
      categoryId: "cat_translate",
      pinned: true,
      usageCount: 0,
      isPreset: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: "preset_polish",
      title: "文章润色",
      content:
        "请润色以下文章，要求：\n- 保持原文的核心意思不变\n- 提升文章的{{风格:学术}}性和可读性\n- 修正语法和用词错误\n- 使表达更加流畅自然\n\n原文：\n{{文章内容}}",
      tags: ["写作", "润色"],
      categoryId: "cat_writing",
      pinned: false,
      usageCount: 0,
      isPreset: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: "preset_brainstorm",
      title: "头脑风暴",
      content:
        "我需要关于「{{主题}}」的创意想法。请从以下角度进行头脑风暴：\n1. 常规方案\n2. 创新方案\n3. 大胆激进的方案\n\n每个方案请给出简要说明和优缺点分析。",
      tags: ["创意", "头脑风暴"],
      categoryId: "cat_creative",
      pinned: false,
      usageCount: 0,
      isPreset: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: "preset_data_analysis",
      title: "数据分析",
      content:
        "请对以下数据进行深入分析：\n\n{{数据内容}}\n\n请从以下维度进行分析：\n1. 数据概览和关键指标\n2. 趋势和模式识别\n3. 异常值检测\n4. 可行建议和行动方案",
      tags: ["分析", "数据"],
      categoryId: "cat_analysis",
      pinned: false,
      usageCount: 0,
      isPreset: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: "preset_explain",
      title: "概念解释",
      content:
        "请用{{难度:通俗易懂}}的方式解释「{{概念}}」这个概念，要求：\n1. 先给出简洁的一句话定义\n2. 用生活中的类比来帮助理解\n3. 列举具体的应用场景\n4. 与相关概念的区别",
      tags: ["学习", "解释"],
      categoryId: "cat_custom",
      pinned: false,
      usageCount: 0,
      isPreset: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: "preset_api_design",
      title: "API 设计",
      content:
        "请为「{{功能描述}}」设计一套 RESTful API，要求：\n1. 列出所有端点（endpoint），包含 HTTP 方法和路径\n2. 请求参数和响应格式（JSON）\n3. 错误码设计\n4. 认证方式建议\n5. 分页和过滤策略",
      tags: ["编程", "API", "设计"],
      categoryId: "cat_coding",
      pinned: false,
      usageCount: 0,
      isPreset: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ],

  // 页面内快捷键定义。
  // id 与 content/shortcuts.js 的动作分发表一一对应，新增动作必须同步两侧。
  // scope: "page" 表示网页内全局生效；"panel" 表示仅在悬浮面板打开时生效（允许无修饰键）。
  // def 为默认组合键；空字符串表示该动作未绑定（禁用）。
  SHORTCUT_META: [
    {
      id: "togglePanel",
      name: "打开 / 关闭面板",
      desc: "在当前网页唤起提示词面板",
      def: "ctrl+shift+p",
      scope: "page",
    },
    {
      id: "closePanel",
      name: "关闭面板",
      desc: "面板打开时按下可关闭",
      def: "esc",
      scope: "panel",
    },
    {
      id: "injectRecent",
      name: "注入最近一条",
      desc: "跳过面板，直接注入最近使用过的提示词",
      def: "ctrl+shift+l",
      scope: "page",
    },
    {
      id: "submit",
      name: "发送当前输入",
      desc: "点击网页 AI 的发送按钮",
      def: "ctrl+shift+enter",
      scope: "page",
    },
    {
      id: "toggleBall",
      name: "显示 / 隐藏悬浮球",
      desc: "临时隐藏页面右下角的悬浮球",
      def: "ctrl+shift+b",
      scope: "page",
    },
  ],
};

// 内容脚本加载顺序。manifest.content_scripts、background 的动态注册、
// popup 的临时注入三处必须共用这一份，顺序错会导致 Draggabilly / nanoid 未定义。
var CONTENT_SCRIPT_FILES = [
  "lib/nanoid.js",
  "lib/purify.min.js",
  "lib/ev-emitter.js",
  "lib/get-size.js",
  "lib/unidragger.js",
  "lib/draggabilly.js",
  "lib/lucide.min.js",
  "shared/utils.js",
  "shared/defaults.js",
  "content/panel-styles.js",
  "content/inject.js",
  "content/panel.js",
  "content/shortcuts.js",
];

// 动态注册 / 注销内容脚本时使用的 ID 前缀，避免误删 manifest 声明的脚本。
var CONTENT_SCRIPT_ID_PREFIX = "pp-site-";
