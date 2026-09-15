/* PromptUtils 快捷键 / match pattern 单元测试
 * 运行：node tests/shortcut.test.js
 * 说明：shared/utils.js 是浏览器全局变量脚本，这里用 vm 把它装进沙箱再取 PromptUtils。
 */
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const utilsPath = path.join(__dirname, "..", "shared", "utils.js");
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(utilsPath, "utf8"), sandbox, {
  filename: utilsPath,
});
const U = sandbox.PromptUtils;

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

// vm 沙箱内创建的对象原型与宿主不同，deepStrictEqual 会误判，先做纯值化
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

// 用字面量构造一个"像" KeyboardEvent 的对象
function ev(overrides) {
  return Object.assign(
    {
      key: "",
      code: "",
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      repeat: false,
      isComposing: false,
    },
    overrides,
  );
}

/* ------------------------- parse / serialize ------------------------- */

test("parseShortcut 解析标准组合键", () => {
  assert.deepStrictEqual(plain(U.parseShortcut("ctrl+shift+p")), {
    ctrl: true,
    alt: false,
    shift: true,
    meta: false,
    key: "p",
  });
});

test("parseShortcut 识别修饰键别名与大小写", () => {
  assert.deepStrictEqual(plain(U.parseShortcut("Control+Alt+Delete")), {
    ctrl: true,
    alt: true,
    shift: false,
    meta: false,
    key: "delete",
  });
  assert.strictEqual(U.parseShortcut("Cmd+Shift+L").meta, true);
});

test("parseShortcut 拒绝主键不在末尾的格式", () => {
  assert.strictEqual(U.parseShortcut("p+ctrl"), null);
  assert.strictEqual(U.parseShortcut(""), null);
  assert.strictEqual(U.parseShortcut("ctrl+"), null);
});

test("serializeShortcut 输出固定顺序，可用于相等比较", () => {
  assert.strictEqual(
    U.serializeShortcut(U.parseShortcut("Shift+Ctrl+P")),
    "ctrl+shift+p",
  );
});

/* --------------------------- 事件匹配 --------------------------- */

test("matchShortcut 命中 ctrl+shift+p", () => {
  assert.ok(
    U.matchShortcut("ctrl+shift+p", ev({ key: "P", code: "KeyP", ctrlKey: true, shiftKey: true })),
  );
});

test("matchShortcut 拒绝修饰键不一致（多按/少按都不算）", () => {
  const base = { key: "P", code: "KeyP", ctrlKey: true, shiftKey: true };
  assert.ok(!U.matchShortcut("ctrl+p", ev(base)), "多按 shift 不应命中 ctrl+p");
  assert.ok(!U.matchShortcut("ctrl+alt+shift+p", ev(base)), "少按 alt 不应命中");
});

test("matchShortcut 用 e.code 规避 Shift 改变 key 的问题", () => {
  // Shift+1 时 e.key 是 "!"，e.code 仍是 Digit1
  assert.ok(U.matchShortcut("ctrl+shift+1", ev({ key: "!", code: "Digit1", ctrlKey: true, shiftKey: true })));
  assert.ok(!U.matchShortcut("ctrl+shift+!", ev({ key: "!", code: "Digit1", ctrlKey: true, shiftKey: true })));
});

test("matchShortcut 支持 esc / 方向键别名", () => {
  assert.ok(U.matchShortcut("esc", ev({ key: "Escape", code: "Escape" })));
  assert.ok(U.matchShortcut("up", ev({ key: "ArrowUp", code: "ArrowUp" })));
});

test("comboFromKeyboardEvent 只按修饰键时返回空串", () => {
  assert.strictEqual(U.comboFromKeyboardEvent(ev({ key: "Shift", code: "ShiftLeft", shiftKey: true })), "");
});

test("comboFromKeyboardEvent 生成规范化组合", () => {
  assert.strictEqual(
    U.comboFromKeyboardEvent(ev({ key: "Enter", code: "Enter", ctrlKey: true, shiftKey: true })),
    "ctrl+shift+enter",
  );
});

/* --------------------------- 格式化 --------------------------- */

test("formatShortcut 输出可读文本", () => {
  assert.strictEqual(U.formatShortcut("ctrl+shift+p"), "Ctrl + Shift + P");
  assert.strictEqual(U.formatShortcut("esc"), "Esc");
  assert.strictEqual(U.formatShortcut(""), "未设置");
});

/* --------------------------- 校验规则 --------------------------- */

test("validateShortcut 空值视为解除绑定", () => {
  assert.deepStrictEqual(plain(U.validateShortcut("", {})), { ok: true, combo: "" });
});

test("validateShortcut 拦截浏览器保留组合", () => {
  assert.strictEqual(U.validateShortcut("ctrl+t", {}).ok, false);
  assert.strictEqual(U.validateShortcut("meta+w", {}).ok, false);
  assert.strictEqual(U.validateShortcut("f12", {}).ok, false);
});

test("validateShortcut 网页级作用域要求带修饰键", () => {
  assert.strictEqual(U.validateShortcut("k", { scope: "page" }).ok, false);
  assert.strictEqual(U.validateShortcut("ctrl+k", { scope: "page" }).ok, true);
});

test("validateShortcut 面板级作用域允许 esc", () => {
  assert.strictEqual(U.validateShortcut("esc", { scope: "panel" }).ok, true);
});

test("validateShortcut 检测动作间冲突并排除自身", () => {
  const bindings = { togglePanel: "ctrl+shift+p", closePanel: "esc" };
  const names = { togglePanel: "打开 / 关闭面板", closePanel: "关闭面板" };
  assert.strictEqual(
    U.validateShortcut("ctrl+shift+p", { bindings, selfId: "togglePanel", names }).ok,
    true,
    "与自身相同不应判为冲突",
  );
  const conflict = U.validateShortcut("ctrl+shift+p", {
    bindings,
    selfId: "submit",
    names,
  });
  assert.strictEqual(conflict.ok, false);
  assert.ok(conflict.reason.includes("打开 / 关闭面板"));
});

test("validateShortcut 拒绝无法识别的输入", () => {
  assert.strictEqual(U.validateShortcut("p+ctrl", {}).ok, false);
});

/* ------------------------- match pattern ------------------------- */

test("normalizeMatchPattern 补齐 scheme 与 path", () => {
  assert.strictEqual(U.normalizeMatchPattern("example.com"), "https://example.com/*");
  assert.strictEqual(U.normalizeMatchPattern("https://example.com"), "https://example.com/*");
  assert.strictEqual(
    U.normalizeMatchPattern("https://example.com/chat"),
    "https://example.com/chat",
  );
});

test("normalizeMatchPattern 去掉查询串与锚点", () => {
  assert.strictEqual(
    U.normalizeMatchPattern("https://example.com/a?b=1#c"),
    "https://example.com/a",
  );
});

test("normalizeMatchPattern 拒绝非 http(s) 协议", () => {
  assert.strictEqual(U.normalizeMatchPattern("ftp://example.com/"), "");
  assert.strictEqual(U.normalizeMatchPattern(""), "");
});

test("isValidMatchPattern 覆盖常见形态", () => {
  assert.ok(U.isValidMatchPattern("https://example.com/*"));
  assert.ok(U.isValidMatchPattern("https://*.example.com/*"));
  assert.ok(U.isValidMatchPattern("http://localhost:3000/*"));
  assert.ok(!U.isValidMatchPattern("https://example.com"), "缺 path 应非法");
  assert.ok(!U.isValidMatchPattern("example.com/*"), "缺 scheme 应非法");
});

test("originOfPattern 推导申请权限用的 origin", () => {
  assert.strictEqual(U.originOfPattern("https://example.com/chat/*"), "https://example.com/*");
  assert.strictEqual(U.originOfPattern("example.com"), "https://example.com/*");
  assert.strictEqual(U.originOfPattern("http://localhost:3000/*"), "http://localhost:3000/*");
});

/* --------------------------- 一致性契约 --------------------------- */

test("popup 与 background 判定同源：normalize 后的 pattern 必须合法", () => {
  const inputs = ["example.com", "https://a.b.c/*", "https://x.io/chat", "http://localhost:8080/*"];
  inputs.forEach((input) => {
    const normalized = U.normalizeMatchPattern(input);
    assert.ok(U.isValidMatchPattern(normalized), input + " 规整后应合法");
    assert.ok(U.originOfPattern(normalized).endsWith("/*"));
  });
});

/* ----------------------------- 汇总 ----------------------------- */

console.log(`通过 ${passed} 项，失败 ${failed} 项`);
if (failed) {
  failures.forEach((line) => console.error("  ✗ " + line));
  process.exit(1);
}
