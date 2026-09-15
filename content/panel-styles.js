/* 页面内 UI（悬浮球 / 浮动面板 / 轻提示）的样式
 *
 * 为什么独立成文件：panel.js 应该只管行为。样式集中在这里后，改视觉不必
 * 在几百行拖拽逻辑里翻找字符串。
 *
 * 两条硬约束：
 *   1. 每条规则都必须 !important —— 宿主页面样式完全不可控，且本站点的
 *      CSS 可能比我们晚加载。
 *   2. 选择器一律以 #pp- / #pi- / .pi- 前缀限定，绝不污染宿主页面。
 *
 * 配色与 popup/popup.css 的 :root 令牌保持一致（深色中性灰阶 + 靛蓝），
 * tests/theme.test.js 会校验两边关键色值不漂移。
 */

// 悬浮球直径。JS 定位计算依赖它，故在此定义，panel.js 引用。
var PP_BALL_SIZE = 44;

/* ------------------------------ 悬浮球 ------------------------------ */
/* 不跟随主题：它是宿主页面上的品牌标识，固定的靛蓝在深浅页面上都可辨识。
   没有渐变、没有脉冲光晕 —— 那两者是"AI 生成 UI"的重灾区。 */
var PP_BALL_CSS = [
  "#pp-floating-ball{position:fixed!important;z-index:2147483646!important;width:" +
    PP_BALL_SIZE +
    "px!important;height:" +
    PP_BALL_SIZE +
    "px!important;border-radius:50%!important;background:#4f6bed!important;border:1px solid rgba(255,255,255,0.16)!important;box-shadow:0 2px 8px rgba(0,0,0,0.34),0 1px 2px rgba(0,0,0,0.28)!important;cursor:pointer!important;display:flex!important;align-items:center!important;justify-content:center!important;user-select:none!important;touch-action:none!important;transition:transform 0.16s ease,box-shadow 0.16s ease,background 0.16s ease!important;margin:0!important;padding:0!important;border-style:solid!important;outline:none!important;opacity:1!important;visibility:visible!important;pointer-events:auto!important}",
  "#pp-floating-ball:hover{background:#6179f2!important;transform:scale(1.05)!important;box-shadow:0 4px 14px rgba(0,0,0,0.4),0 1px 2px rgba(0,0,0,0.3)!important}",
  "#pp-floating-ball:active{transform:scale(0.96)!important}",
  "#pp-floating-ball.pp-ball-dragging{transform:scale(1.06)!important;box-shadow:0 6px 18px rgba(0,0,0,0.44),0 1px 2px rgba(0,0,0,0.3)!important}",
  ".pp-ball-icon{display:flex!important;align-items:center!important;justify-content:center!important;pointer-events:none!important;margin:0!important;padding:0!important;color:#ffffff!important;font-size:0!important;line-height:0!important}",
  ".pp-ball-icon svg{width:19px!important;height:19px!important;stroke-width:2!important;display:block!important}",
].join("\n");

/* ------------------------------ 浮动面板 ------------------------------ */

var PP_PANEL_CSS = [
  // 令牌：作用域限定在面板内，浅色主题通过 [data-theme] 覆盖
  "#prompt-injector-panel{--pi-bg:#1d1f23;--pi-surface:#26282e;--pi-inset:#101114;--pi-border:#2c2f35;--pi-border-strong:#3b3f47;--pi-text:#e6e8eb;--pi-sub:#a0a6b0;--pi-dim:#6e747e;--pi-faint:#525860;--pi-accent:#4f6bed;--pi-accent-hover:#6179f2;--pi-accent-soft:rgba(79,107,237,0.14);--pi-accent-line:rgba(79,107,237,0.45);--pi-tag:#26282e;--pi-tag-text:#a0a6b0;--pi-danger:#e0574f;--pi-amber:#d2983c}",
  '#prompt-injector-panel[data-theme="light"]{--pi-bg:#ffffff;--pi-surface:#f1f0ef;--pi-inset:#f5f4f3;--pi-border:#e2dfdf;--pi-border-strong:#cfcbcb;--pi-text:#1b1c1e;--pi-sub:#5c6067;--pi-dim:#868b93;--pi-faint:#a8adb4;--pi-accent:#3d57d9;--pi-accent-hover:#3350cc;--pi-accent-soft:rgba(61,87,217,0.10);--pi-accent-line:rgba(61,87,217,0.34);--pi-tag:#efedec;--pi-tag-text:#5c6067;--pi-danger:#c4382f;--pi-amber:#a97016}',

  // 容器
  '#prompt-injector-panel{position:fixed!important;width:380px;max-width:calc(100vw - 20px);height:420px;max-height:calc(100vh - 20px);min-height:150px;min-width:200px;background:var(--pi-bg)!important;color:var(--pi-text)!important;border:1px solid var(--pi-border)!important;border-radius:10px!important;box-shadow:0 10px 28px rgba(0,0,0,0.48),0 2px 6px rgba(0,0,0,0.3)!important;z-index:2147483647!important;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",Roboto,sans-serif!important;font-size:12px!important;display:flex!important;flex-direction:column!important;overflow:hidden!important;resize:none!important}',
  "#prompt-injector-panel.pi-resizing{user-select:none!important;transition:none!important}",
  "#prompt-injector-panel.pi-dragging{opacity:0.92!important;cursor:move!important}",
  "#prompt-injector-panel *{box-sizing:border-box!important}",

  // 头部：可拖拽
  "#pi-header{display:flex!important;justify-content:space-between!important;align-items:center!important;padding:10px 12px!important;border-bottom:1px solid var(--pi-border)!important;cursor:move!important;user-select:none!important;flex-shrink:0!important}",
  "#pi-header span{font-weight:600!important;font-size:13px!important;letter-spacing:-0.01em!important;pointer-events:none!important;color:var(--pi-text)!important}",
  "#pi-close{background:none!important;border:none!important;color:var(--pi-dim)!important;cursor:pointer!important;padding:3px!important;border-radius:3px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;line-height:0!important;transition:color 0.14s,background 0.14s!important}",
  "#pi-close:hover{color:var(--pi-text)!important;background:var(--pi-surface)!important}",
  "#pi-close svg{width:15px!important;height:15px!important}",

  // 分类
  "#pi-cats{display:flex!important;gap:3px!important;padding:7px 10px!important;border-bottom:1px solid var(--pi-border)!important;overflow-x:auto!important;scrollbar-width:none!important;flex-shrink:0!important}",
  "#pi-cats::-webkit-scrollbar{display:none!important}",
  ".pi-cat{padding:4px 9px!important;border-radius:5px!important;border:1px solid transparent!important;background:none!important;color:var(--pi-sub)!important;font-size:11px!important;font-family:inherit!important;cursor:pointer!important;white-space:nowrap!important;transition:background 0.14s,color 0.14s,border-color 0.14s!important}",
  ".pi-cat:hover{background:var(--pi-surface)!important;color:var(--pi-text)!important}",
  ".pi-cat.active{background:var(--pi-accent-soft)!important;color:var(--pi-accent)!important;border-color:var(--pi-accent-line)!important}",

  // 搜索
  "#pi-search{padding:8px 10px!important;border-bottom:1px solid var(--pi-border)!important;flex-shrink:0!important}",
  "#pi-search-input{width:100%!important;padding:7px 10px!important;background:var(--pi-inset)!important;border:1px solid var(--pi-border)!important;border-radius:5px!important;color:var(--pi-text)!important;font-size:12px!important;font-family:inherit!important;outline:none!important;box-sizing:border-box!important;transition:border-color 0.14s,box-shadow 0.14s!important}",
  "#pi-search-input:focus{border-color:var(--pi-accent)!important;box-shadow:0 0 0 3px var(--pi-accent-soft)!important}",
  "#pi-search-input::placeholder{color:var(--pi-faint)!important}",

  // 列表
  "#pi-list{overflow-y:auto!important;flex:1!important;min-height:0!important}",
  ".pi-item{padding:9px 12px!important;cursor:pointer!important;border-bottom:1px solid var(--pi-border)!important;transition:background 0.14s!important}",
  ".pi-item:hover{background:var(--pi-surface)!important}",
  ".pi-item:last-child{border-bottom:none!important}",
  ".pi-item-header{display:flex!important;align-items:center!important;gap:6px!important;margin-bottom:2px!important}",
  ".pi-item-title{font-weight:600!important;font-size:12px!important;color:var(--pi-text)!important;letter-spacing:-0.005em!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}",
  ".pi-pin{display:inline-flex!important;color:var(--pi-amber)!important;flex-shrink:0!important}",
  ".pi-pin svg{width:11px!important;height:11px!important}",
  ".pi-tpl-badge{font-size:10px!important;padding:1px 5px!important;border-radius:3px!important;background:var(--pi-tag)!important;color:var(--pi-accent)!important;flex-shrink:0!important}",
  ".pi-usage{font-size:10px!important;color:var(--pi-faint)!important;margin-left:auto!important;flex-shrink:0!important}",
  ".pi-item-preview{font-size:11px!important;color:var(--pi-sub)!important;font-family:ui-monospace,'SF Mono','Cascadia Code',Consolas,monospace!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;line-height:1.55!important}",
  ".pp-var-chip{display:inline-block!important;font-family:ui-monospace,'SF Mono','Cascadia Code',Consolas,monospace!important;font-size:10px!important;line-height:1.4!important;padding:0 4px!important;margin:0 1px!important;border-radius:3px!important;background:var(--pi-accent-soft)!important;color:var(--pi-accent)!important;border:1px solid var(--pi-accent-line)!important;vertical-align:baseline!important}",
  ".pi-item-tags{margin-top:4px!important;display:flex!important;gap:4px!important;flex-wrap:wrap!important}",
  ".pi-tag{font-size:10px!important;padding:1px 6px!important;border-radius:3px!important;background:var(--pi-tag)!important;color:var(--pi-tag-text)!important}",
  ".pi-empty{padding:24px!important;text-align:center!important;color:var(--pi-faint)!important;font-size:12px!important}",
  "#pi-list::-webkit-scrollbar{width:8px!important}",
  "#pi-list::-webkit-scrollbar-track{background:transparent!important}",
  "#pi-list::-webkit-scrollbar-thumb{background:var(--pi-border-strong)!important;border-radius:999px!important;border:2px solid transparent!important;background-clip:content-box!important}",

  // 模板填写
  "#pi-template-dialog{position:absolute!important;top:0!important;left:0!important;right:0!important;bottom:0!important;background:var(--pi-bg)!important;display:flex!important;flex-direction:column!important;z-index:10!important}",
  "#pi-template-dialog.hidden{display:none!important}",
  "#pi-tpl-header{display:flex!important;justify-content:space-between!important;align-items:center!important;padding:10px 12px!important;border-bottom:1px solid var(--pi-border)!important;flex-shrink:0!important}",
  "#pi-tpl-header span{font-weight:600!important;font-size:13px!important;color:var(--pi-text)!important}",
  "#pi-tpl-back{background:none!important;border:none!important;color:var(--pi-accent)!important;font-size:12px!important;font-family:inherit!important;cursor:pointer!important;padding:2px 4px!important;border-radius:3px!important;transition:background 0.14s!important}",
  "#pi-tpl-back:hover{background:var(--pi-accent-soft)!important}",
  "#pi-tpl-fields{padding:12px!important;display:flex!important;flex-direction:column!important;gap:10px!important;overflow-y:auto!important;flex:1!important;min-height:0!important}",
  ".pi-tpl-field{display:flex!important;flex-direction:column!important;gap:5px!important}",
  ".pi-tpl-field label{font-size:11px!important;font-weight:600!important;color:var(--pi-sub)!important}",
  ".pi-tpl-field input{width:100%!important;padding:7px 9px!important;background:var(--pi-inset)!important;border:1px solid var(--pi-border)!important;border-radius:5px!important;color:var(--pi-text)!important;font-size:12px!important;font-family:inherit!important;outline:none!important;transition:border-color 0.14s,box-shadow 0.14s!important}",
  ".pi-tpl-field input:focus{border-color:var(--pi-accent)!important;box-shadow:0 0 0 3px var(--pi-accent-soft)!important}",
  "#pi-tpl-preview{padding:8px 12px 12px!important;border-top:1px solid var(--pi-border)!important;flex-shrink:0!important}",
  "#pi-tpl-preview label{font-size:10px!important;font-weight:600!important;color:var(--pi-dim)!important;display:block!important;margin-bottom:5px!important;letter-spacing:0.04em!important}",
  "#pi-tpl-preview-content{font-size:11px!important;color:var(--pi-text)!important;background:var(--pi-inset)!important;border:1px solid var(--pi-border)!important;border-radius:5px!important;padding:8px 10px!important;max-height:80px!important;overflow-y:auto!important;white-space:pre-wrap!important;word-break:break-all!important;line-height:1.6!important;font-family:ui-monospace,'SF Mono','Cascadia Code',Consolas,monospace!important}",
  "#pi-tpl-actions{padding:10px 12px!important;display:flex!important;justify-content:flex-end!important;gap:7px!important;border-top:1px solid var(--pi-border)!important;flex-shrink:0!important}",

  // 按钮
  ".pi-btn{padding:6px 13px!important;border-radius:5px!important;font-size:11px!important;font-weight:500!important;font-family:inherit!important;cursor:pointer!important;border:1px solid transparent!important;transition:background 0.14s,color 0.14s,border-color 0.14s!important}",
  ".pi-btn-primary{background:var(--pi-accent)!important;color:#ffffff!important}",
  ".pi-btn-primary:hover{background:var(--pi-accent-hover)!important}",
  ".pi-btn-secondary{background:var(--pi-surface)!important;color:var(--pi-text)!important;border-color:var(--pi-border)!important}",
  ".pi-btn-secondary:hover{background:var(--pi-border)!important}",

  // 缩放手柄
  "#pi-resize-handle{position:absolute!important;left:0!important;bottom:0!important;width:16px!important;height:16px!important;cursor:nwse-resize!important;z-index:5!important;opacity:0.35!important;transition:opacity 0.14s!important}",
  "#pi-resize-handle:hover{opacity:0.75!important}",
  "#pi-resize-handle::before{content:''!important;position:absolute!important;left:3px!important;bottom:3px!important;width:8px!important;height:8px!important;border-left:2px solid var(--pi-dim)!important;border-bottom:2px solid var(--pi-dim)!important}",

  "#prompt-injector-panel svg[data-lucide]{width:14px!important;height:14px!important;stroke-width:1.9!important;vertical-align:middle!important}",
].join("\n");

/* ------------------------------ 页面内轻提示 ------------------------------ */
/* 独立注入：面板未打开、悬浮球被隐藏时也要能给反馈。
   固定深色 —— 宿主页面深浅未知，深色卡片在两种页面上都不会糊掉。 */
var PP_NOTICE_CSS = [
  "#pp-notice{position:fixed!important;z-index:2147483647!important;right:16px!important;bottom:16px!important;padding:9px 13px!important;border-radius:6px!important;background:#1d1f23!important;border:1px solid #2c2f35!important;border-left:3px solid #4f6bed!important;color:#e6e8eb!important;font-size:12px!important;line-height:1.5!important;max-width:280px!important;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',Roboto,sans-serif!important;box-shadow:0 4px 14px rgba(0,0,0,0.4),0 1px 2px rgba(0,0,0,0.3)!important;pointer-events:none!important;margin:0!important}",
].join("\n");
