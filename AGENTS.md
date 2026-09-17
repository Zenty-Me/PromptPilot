# AGENTS.md — PromptPilot

Chrome extension (Manifest V3), vanilla JS. One-way injects prompts into web-AI chat boxes.

## Build & verification

- **No build step and no bundler.** The extension runs directly from source. Load it unpacked via `chrome://extensions` (enable Developer mode) → "Load unpacked".
- **No linter or CI.** Run `npm test` before declaring work done — it runs nine suites plus the legacy drag check:
  - `tests/shortcut.test.js` — shortcut parse/match/format/validate + URL normalization (pure logic, `vm`-loaded).
  - `tests/consistency.test.js` — static cross-file contract check (DOM ids, `data-*` producers/consumers, message types, cross-module exports, manifest vs `CONTENT_SCRIPT_FILES`, `hidden` 类的 CSS 兜底).
  - `tests/shortcuts-dom.test.js` — `content/shortcuts.js` dispatch behaviour driven by real jsdom `KeyboardEvent`s.
  - `tests/inject-dom.test.js` — custom-site matching, `enabled` filtering, selector precedence, replace/append 注入模式.
  - `tests/detector-dom.test.js` — `shared/detector.js` selector generation / input & send detection, plus `content/inject.js` writing detected selectors back to storage.
  - `tests/site-match.test.js` — `PromptUtils.matchSiteForUrl` / `patternMatchesUrl`（最具体优先、enabled 过滤、端口忽略）.
  - `tests/popup-dom.test.js` — popup 交互：用真实 jsdom + 桩 `chrome` API 加载整套 `popup/*.js`，覆盖标签筛选、追加注入、注入失败自愈、未授权站点授权。要加新的 popup 交互测试就放这里，别再造一套 harness。
  - `tests/panel-ball.test.js` — `content/panel.js` 悬浮球定位：right/bottom ↔ left/top 换算、越界夹取、窗口 resize 后重新夹取。这是唯一真正加载 `content/panel.js` 的测试，也因此守住了 `panel-styles.js` 必须先于 `panel.js` 的加载顺序。
  - `dragtest.js` — jsdom check of the Draggabilly drag stack.
- `node --check <file>` still catches syntax errors, but is not sufficient on its own.
- After editing any source file, **reload the extension** at `chrome://extensions` for changes to take effect.

## Dependencies are vendored, not from npm

- Third-party libs live as pre-minified files in `lib/` (e.g. `draggabilly.js`, `purify.min.js`, `lucide.min.js`). `node_modules/` is gitignored and **not used at runtime**.
- `package.json` lists deps only for reference/dev convenience — do **not** assume an `npm install` wires them into the extension. To add a library, vendor the file into `lib/` and reference it in `manifest.json`.
- Manifest `content_scripts[].js` list is the **load order** and it matters: `ev-emitter.js`, `get-size.js`, `unidragger.js` must precede `draggabilly.js`; `nanoid.js`/`purify.min.js` must precede `shared/utils.js` (which calls `nanoid` and `DOMPurify`).

## Architecture (manifests are source of truth)

- `manifest.json` is authoritative for supported sites and content-script wiring — the README's platform table and `lib/` file list are stale; trust the manifest.
- `background.js` is a Service Worker with two jobs: forward the browser-level `open-prompt-panel` command to the active tab (`toggle_panel`), and keep dynamically registered content scripts in sync with `customSites` (see below). It `importScripts("shared/utils.js", "shared/defaults.js")`.
- `content/inject.js` holds the per-site input/send Selector maps (AI platform DOM hooks). `content/panel.js` is the in-page floating picker. `content/shortcuts.js` is the in-page configurable-shortcut dispatcher.
- `popup/` is the full management UI (also reused as the Side Panel via `side_panel.default_path`). `popup/storage.js` owns all `chrome.storage.local` access; `shared/defaults.js` seeds preset data.
- `shared/utils.js` provides template parsing (`{{var}}` / `{{var:default}}`), `escapeHtml`/`generateId`, shortcut helpers, and match-pattern helpers.

## Custom sites (adding a web AI) — how it actually works

- `manifest.json` `content_scripts[].matches` covers only the **built-in** sites. User-added sites get scripts via `chrome.scripting.registerContentScripts` at runtime, keyed by ID `pp-site-<siteId>` (`CONTENT_SCRIPT_ID_PREFIX`).
- `optional_host_permissions` is `http://*/*` + `https://*/*`. The **popup** requests the per-site origin (it has the user gesture); the background **never** prompts — `syncRegisteredScripts()` silently skips unauthorized sites. Changing this split will break permission granting.
- URL normalization lives in one place (`PromptUtils.normalizeMatchPattern` / `isValidMatchPattern` / `originOfPattern`). background and popup must both call it, otherwise "popup granted permission but background thinks the pattern is invalid".
- Newly registered scripts load on the **next page load/refresh**; there is no way to retro-inject into an already-open tab.
- `storage.onChanged` on `customSites` triggers a debounced sync, so plain storage writes from the popup are enough to register/unregister.

## 智能添加站点（只填网址）

- 用户只填 URL：`PromptUtils.deriveSitePattern` 推导匹配规则（域名 + 首段路径 + `/*`，深层会话 ID 会被丢掉），`PromptUtils.deriveSiteName` 从域名推导名称。两者都在 `shared/utils.js`，并有 `tests/shortcut.test.js` 覆盖。
- `shared/detector.js` 负责页面 DOM 探测（输入框打分挑优、发送按钮语义识别、生成稳定 CSS Selector）。它有两个调用方，**因此不能依赖 PromptUtils / PromptInjector**：popup 用 `chrome.scripting.executeScript({files:["shared/detector.js"]})` 单独注入它，内容脚本则通过 manifest / `CONTENT_SCRIPT_FILES` 加载。改这个文件要同时兼顾两条路。
- 保存时若网址正开着活动标签页，popup 当场在该页探测；否则先存 `inputSelector: ""`，由 `content/inject.js` 在用户访问该站点时补全（SPA 输入框常晚于 `document_idle`，所以按 0.8/2.5/5 秒重试几次）。
- 已经手写过 `inputSelector` 的站点不会被自动识别覆盖，`pendingDetectSite()` 是这条保护的唯一判据。

## Configurable shortcuts — two independent layers

- **In-page** (fully configurable): `PromptDefaults.SHORTCUT_META` defines actions; bindings live in `storage.shortcuts` as canonical lowercase strings (`ctrl+shift+p`). `content/shortcuts.js` matches them and dispatches to `PromptPanel`. Adding an action requires editing **both** `SHORTCUT_META` and the `runAction` dispatch (the consistency test enforces this).
- **Browser-level**: `manifest.commands` cannot be rewritten at runtime — the UI shows `chrome.commands.getAll()` and links to `chrome://extensions/shortcuts`. background mirrors active global combos into `storage.globalShortcuts`; `content/shortcuts.js` ignores any combo in that list so a shared combo isn't handled twice (which would toggle the panel open then straight back closed).
- Combos are canonicalized through `PromptUtils.serializeShortcut` (order: ctrl → alt → shift → meta → key). Never compare raw strings.
- Key matching uses `event.code` (`KeyP`, `Digit1`) rather than `event.key`, so `Shift+P`/`Shift+1` don't degrade into `P`/`!`.

## Styling

- **Two stylesheets, one palette.** `popup/popup.css` uses `:root` tokens; `content/panel-styles.js` re-declares the same values scoped under `#prompt-injector-panel` (it is injected into third-party pages and cannot use `:root`). They are copies, so `tests/theme.test.js` asserts the pairs match. **If you change a colour, change it in both.**
- Design language: neutral graphite greys with a single indigo accent (`--accent`). The accent marks *state* (selected, focused, primary action) — never decoration. Deliberately avoided: gradients, glow/aura box-shadows, pulsing animations, and "hover turns everything accent-coloured".
- Scale is fixed: radii `3/5/8/10px`, font sizes `10/11/12/13/14px` (never below 10px), three shadow tiers (`--sh-sm/md/lg`). Use the tokens, not raw values.
- Every rule in `panel-styles.js` needs `!important` (host page CSS is unpredictable and may load later), and every selector must be `pp-`/`pi-` prefixed so the host page isn't polluted.
- `content/panel-styles.js` must load **before** `content/panel.js` — panel.js is an IIFE that reads `PP_BALL_SIZE` at the top level. The jsdom tests stub `PromptPanel` and won't catch an ordering regression; the consistency test does.
- Text symbols (`☰`, `⊟`, `▼`, `&times;`) are gone — all iconography is Lucide, so new UI must use `<i data-lucide="...">` and call `refreshIcons()` after injecting markup.

## Conventions / gotchas

- Template variables use double-brace syntax `{{name:default}}`; `fillTemplate` falls back to the default (or leaves the raw token) when no value is supplied.
- **Every failure path needs an exit, not just a toast.** 注入失败 / 未授权站点这类终态必须给用户可点的下一步（见下方「失败自愈」）。新功能的验收标准包含"失败之后怎么走"。
- All persistence is `chrome.storage.local` (survives browser restart), initialized from `PromptDefaults` on first run.
- Icons draw from local Lucide (no network/emoji) — keep new UI consistent.
- Custom sites let users override input/send Selectors. Resolution order is **custom site → built-in hostname map → generic `contenteditable`/`textarea` detection** (custom sites win over built-ins). When several custom patterns match, the longest `pattern` wins; `enabled === false` sites are skipped, and a missing `enabled` field is treated as enabled.
- `CONTENT_SCRIPT_FILES` in `shared/defaults.js` is the single source for content-script load order — manifest `content_scripts`, background dynamic registration, and the popup's `executeScript` fallback all reference it. Never hand-roll the list.
- `injectPromptToPage(text, shouldSubmit, options)` accepts `options.mode` of `"replace"` (default) or `"append"`。append 走已有内容之后追加（textarea 用 `\n` 连接），入口有两个：popup 右键菜单「追加到现有内容」，以及面板里 **Alt + 点击**条目；模板填值注入会沿用发起时选定的 mode（`pendingInjectMode` / `currentPanelTemplateMode`）。
- 悬浮球位置落盘的是 `right`/`bottom`（距视口右下角的距离），球体坐标只由它推导。**改动位置时必须经 `applyBallPos`**（它把最终 left/top 夹进视口再反推 right/bottom），并且 `ballPos` 内存副本要在拖拽/吸附后同步（`persistBallPos`）。窗口 resize 会重新夹取 —— 少了这一步，用户把窗口拖窄后球会永久停在视口外点不到。
- Content-script UI strings are Chinese; keep new user-facing copy in the same voice.

## 失败自愈（failure → next step）

- **popup**：`doInject` 失败 → `offerRepair()` 用 `PromptUtils.matchSiteForUrl` 找到当前页面命中的站点（没有就用 `deriveSitePattern` 推导一条），弹出行动条 `#action-bar`（`showActionBar(text, btnLabel, handler)` / `hideActionBar()`，在列表上方，不止贴合一个场景，也能给"Site added, reload?"用）。点按钮 → 申请权限 → `detectFromActiveTab` → 写回站点 → **自动重试刚才那次注入**（`lastInjectState`）。
- **面板**：`injectFromPanel` 统一收口。失败时先用页面里已经加载的 `PromptDetector` 就地重识别并写 storage，等 storage 事件回流（`setTimeout` 80ms）再重试一次；仍失败才收尾提示。
- **未授权**：站点列表每项都有默认隐藏的 `[data-site-grant]` 按钮，`markUnauthorizedSites()` 同时管未授权标记和这个按钮的显隐。授权成功后 `suggestTabReload()` 找到正在访问该站点的标签页问一句要不要刷新（内容脚本只在页面加载时注入）。
- popup 既作为 action popup 也作为侧边栏运行：`isPopupWindow()` 判断是否该 `window.close()` —— 侧边栏里不关，避免同一份代码两种行为。

## Styling 陷阱

- `.hidden` 是**通用工具类**（`popup/popup.css`），不是每个组件各写一条的历史遗留方式。组件级的 `.x.hidden` 曾经漏过：`#import-file`、站点"未授权"标记都因此藏不住。`tests/consistency.test.js` 守着这条底线。
- 拼接 HTML 字符串时，**三元表达式后面还要继续拼接就必须加括号**。render.js 曾因为漏括号把"未授权标记 + 编辑/删除按钮"整段算进了 else 分支 —— 配好选择器的站点会丢掉全部操作按钮。这种 bug 只能靠 jsdom 测试暴露，`node --check` 查不出来。
