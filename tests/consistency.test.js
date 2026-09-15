/* 静态一致性检查：防止多文件重构后产生"幽灵引用"
 * 覆盖四条易漂移的契约：
 *   1. app.js getElementById 的 id 必须在 popup.html 中存在
 *   2. app.js 读取的 dataset.* 必须由 render.js 或 popup.html 产出
 *   3. app.js 发给 background 的消息 type 必须有处理分支
 *   4. content/shortcuts.js 调用的 PromptPanel 方法、panel.js 调用的
 *      PromptInjector 方法必须在对应模块中导出
 * 运行：node tests/consistency.test.js
 */
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const html = read("popup/popup.html");
const app = read("popup/app.js");
const render = read("popup/render.js");
const background = read("background.js");
const shortcuts = read("content/shortcuts.js");
const panel = read("content/panel.js");
const inject = read("content/inject.js");
const storage = read("popup/storage.js");

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    failed += 1;
    failures.push(name + " → " + error.message);
  }
}

const camelToDash = (s) => s.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());

// 取某文件最后一个 `return {` 之后的块，作为该模块的导出清单
function exportBlock(source) {
  return source.slice(source.lastIndexOf("return {"));
}

function hasExport(block, name) {
  return new RegExp("\\b" + name + "\\s*:").test(block);
}

test("app.js 引用的 DOM id 都存在于 popup.html", () => {
  const ids = [
    ...new Set([...app.matchAll(/getElementById\(\s*"([^"]+)"/g)].map((m) => m[1])),
  ];
  const missing = ids.filter((id) => !html.includes('id="' + id + '"'));
  assert.deepStrictEqual(missing, [], "缺失 id: " + missing.join(", "));
});

test("app.js 读取的 dataset 属性都有产出方", () => {
  const produced = new Set(
    [...(render + html).matchAll(/data-([a-z-]+)=/g)].map((m) => m[1]),
  );
  const consumed = [
    ...new Set([...app.matchAll(/dataset\.([A-Za-z]+)/g)].map((m) => m[1])),
  ];
  const missing = consumed
    .map((name) => ({ name, attr: camelToDash(name) }))
    .filter((item) => !produced.has(item.attr));
  assert.deepStrictEqual(
    missing.map((m) => m.attr),
    [],
    "未产出的 data 属性: " + missing.map((m) => m.attr).join(", "),
  );
});

test("popup 发出的 pp_* 消息都有 background 处理分支", () => {
  const sent = [
    ...new Set([...app.matchAll(/type:\s*"([^"]+)"/g)].map((m) => m[1])),
  ].filter((type) => type.indexOf("pp_") === 0);
  const handled = new Set(
    [...background.matchAll(/message\.type === "([^"]+)"/g)].map((m) => m[1]),
  );
  const unhandled = sent.filter((type) => !handled.has(type));
  assert.deepStrictEqual(
    unhandled,
    [],
    "background 未处理: " + unhandled.join(", "),
  );
});

test("shortcuts.js 调用的 PromptPanel 方法均已导出", () => {
  const block = exportBlock(panel);
  const calls = [
    ...new Set([...shortcuts.matchAll(/PromptPanel\.(\w+)/g)].map((m) => m[1])),
  ].filter((name) => name !== "undefined");
  assert.ok(calls.length > 0, "应至少调用一个 PromptPanel 方法");
  const missing = calls.filter((name) => !hasExport(block, name));
  assert.deepStrictEqual(missing, [], "panel.js 未导出: " + missing.join(", "));
});

test("panel.js 调用的 PromptInjector 方法均已导出", () => {
  const block = exportBlock(inject);
  const calls = [
    ...new Set([...panel.matchAll(/PromptInjector\.(\w+)/g)].map((m) => m[1])),
  ];
  const missing = calls.filter((name) => !hasExport(block, name));
  assert.deepStrictEqual(
    missing,
    [],
    "inject.js 未导出: " + missing.join(", "),
  );
});

test("app.js 调用的 PromptStorage 方法均已导出", () => {
  const block = exportBlock(storage);
  const calls = [
    ...new Set([...app.matchAll(/PromptStorage\.(\w+)/g)].map((m) => m[1])),
  ];
  const missing = calls.filter((name) => !hasExport(block, name));
  assert.deepStrictEqual(
    missing,
    [],
    "storage.js 未导出: " + missing.join(", "),
  );
});

test("SHORTCUT_META 的 id 与 shortcuts.js 的动作分发表一一对应", () => {
  const defaults = read("shared/defaults.js");
  // 只在 SHORTCUT_META 代码块内取 id，避免误抓 CATEGORIES / PROMPTS 的 id
  const metaBlock = defaults.slice(
    defaults.indexOf("SHORTCUT_META:"),
    defaults.indexOf("var CONTENT_SCRIPT_FILES"),
  );
  const ids = [...metaBlock.matchAll(/^\s{6}id: "(\w+)",$/gm)].map((m) => m[1]);
  assert.ok(ids.length >= 3, "SHORTCUT_META 至少应有 3 个动作，实际 " + ids.length);
  const unique = [...new Set(ids)];
  assert.deepStrictEqual(ids, unique, "SHORTCUT_META 存在重复 id");
  unique.forEach((id) => {
    const dispatched = new RegExp('id === "' + id + '"').test(shortcuts);
    assert.ok(dispatched, "shortcuts.js 未处理动作: " + id);
  });
});

test("manifest content_scripts 与 CONTENT_SCRIPT_FILES 保持一致", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const declared = manifest.content_scripts[0].js;
  const shared = read("shared/defaults.js");
  const block = shared.slice(
    shared.indexOf("var CONTENT_SCRIPT_FILES"),
    shared.indexOf("// 动态注册"),
  );
  const listed = [...block.matchAll(/"([^"]+\.js)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(
    declared,
    listed,
    "manifest 与 CONTENT_SCRIPT_FILES 顺序/内容不一致",
  );
});

test("manifest 声明的内容脚本文件都真实存在", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const missing = manifest.content_scripts[0].js.filter(
    (f) => !fs.existsSync(path.join(root, f)),
  );
  assert.deepStrictEqual(missing, [], "清单引用了不存在的文件: " + missing.join(", "));
});

test("panel-styles.js 必须先于 panel.js 加载", () => {
  // panel.js 是立即执行的 IIFE，顶层就要读 PP_BALL_SIZE / PP_BALL_CSS，
  // 顺序颠倒会在真机上抛 ReferenceError —— 而 jsdom 测试用 stub 顶替了
  // PromptPanel，不会暴露这个问题，所以必须静态守住。
  const manifest = JSON.parse(read("manifest.json"));
  const order = manifest.content_scripts[0].js;
  const stylesAt = order.indexOf("content/panel-styles.js");
  const panelAt = order.indexOf("content/panel.js");
  assert.ok(stylesAt >= 0, "内容脚本缺少 content/panel-styles.js");
  assert.ok(panelAt >= 0, "内容脚本缺少 content/panel.js");
  assert.ok(
    stylesAt < panelAt,
    "content/panel-styles.js 必须排在 content/panel.js 之前",
  );
});

console.log(`通过 ${passed} 项，失败 ${failed} 项`);
if (failed) {
  failures.forEach((line) => console.error("  ✗ " + line));
  process.exit(1);
}
