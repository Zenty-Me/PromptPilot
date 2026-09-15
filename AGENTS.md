# AGENTS.md — PromptPilot

Chrome extension (Manifest V3), vanilla JS. One-way injects prompts into web-AI chat boxes.

## Build & verification

- **No build step and no bundler.** The extension runs directly from source. Load it unpacked via `chrome://extensions` (enable Developer mode) → "Load unpacked".
- **No linter or CI.** Run `npm test` before declaring work done — it runs four suites plus the legacy drag check:
  - `tests/shortcut.test.js` — shortcut parse/match/format/validate + URL normalization (pure logic, `vm`-loaded).
  - `tests/consistency.test.js` — static cross-file contract check (DOM ids, `data-*` producers/consumers, message types, cross-module exports, manifest vs `CONTENT_SCRIPT_FILES`).
  - `tests/shortcuts-dom.test.js` — `content/shortcuts.js` dispatch behaviour driven by real jsdom `KeyboardEvent`s.
  - `tests/inject-dom.test.js` — custom-site matching, `enabled` filtering, selector precedence.
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
- All persistence is `chrome.storage.local` (survives browser restart), initialized from `PromptDefaults` on first run.
- Icons draw from local Lucide (no network/emoji) — keep new UI consistent.
- Custom sites let users override input/send Selectors. Resolution order is **custom site → built-in hostname map → generic `contenteditable`/`textarea` detection** (custom sites win over built-ins). When several custom patterns match, the longest `pattern` wins; `enabled === false` sites are skipped, and a missing `enabled` field is treated as enabled.
- `CONTENT_SCRIPT_FILES` in `shared/defaults.js` is the single source for content-script load order — manifest `content_scripts`, background dynamic registration, and the popup's `executeScript` fallback all reference it. Never hand-roll the list.
- `injectPromptToPage(text, shouldSubmit, options)` accepts `options.mode` of `"replace"` (default) or `"append"`.
- Content-script UI strings are Chinese; keep new user-facing copy in the same voice.
