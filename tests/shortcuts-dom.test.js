/* content/shortcuts.js 行为测试（jsdom 真实事件驱动）
 * 验证：组合键匹配、作用域、全局命令避让、输入框保护、自定义绑定热更新。
 * 运行：node tests/shortcuts-dom.test.js
 */
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = path.join(__dirname, "..");

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

// 每个用例一套干净的 jsdom 环境，避免 listener 与 storage 互相污染
function createEnv(initialStore) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    runScripts: "dangerously",
  });
  const win = dom.window;
  const store = Object.assign({}, initialStore || {});
  const calls = [];

  win.chrome = {
    storage: {
      local: {
        get(defaults, callback) {
          callback(Object.assign({}, defaults, store));
        },
        set(obj, callback) {
          Object.assign(store, obj);
          if (callback) callback();
        },
      },
      onChanged: { addListener() {} },
    },
  };

  win.PromptPanel = {
    isPanelOpen: () => win.__panelOpen === true,
    togglePanel: () => calls.push("togglePanel"),
    closePanel: () => calls.push("closePanel"),
    injectRecent: () => calls.push("injectRecent"),
    submitCurrent: () => calls.push("submitCurrent"),
    toggleBall: () => calls.push("toggleBall"),
  };

  ["shared/utils.js", "shared/defaults.js", "content/shortcuts.js"].forEach(
    (file) => {
      const script = win.document.createElement("script");
      script.textContent = fs.readFileSync(path.join(root, file), "utf8");
      win.document.body.appendChild(script);
    },
  );

  function press(init) {
    const event = new win.KeyboardEvent(
      "keydown",
      Object.assign({ bubbles: true, cancelable: true }, init),
    );
    win.document.body.dispatchEvent(event);
    return event;
  }

  return { win, calls, store, press };
}

const CTRL_SHIFT_P = { key: "P", code: "KeyP", ctrlKey: true, shiftKey: true };

/* ---------------------------- 默认绑定 ---------------------------- */

test("默认 Ctrl+Shift+P 打开面板", () => {
  const env = createEnv();
  const event = env.press(CTRL_SHIFT_P);
  assert.deepStrictEqual(env.calls, ["togglePanel"]);
  assert.strictEqual(event.defaultPrevented, true, "命中后应阻止页面继续处理");
});

test("默认 Ctrl+Shift+L 注入最近一条", () => {
  const env = createEnv();
  env.press({ key: "L", code: "KeyL", ctrlKey: true, shiftKey: true });
  assert.deepStrictEqual(env.calls, ["injectRecent"]);
});

test("默认 Ctrl+Shift+B 切换悬浮球", () => {
  const env = createEnv();
  env.press({ key: "B", code: "KeyB", ctrlKey: true, shiftKey: true });
  assert.deepStrictEqual(env.calls, ["toggleBall"]);
});

test("默认 Ctrl+Shift+Enter 发送", () => {
  const env = createEnv();
  env.press({ key: "Enter", code: "Enter", ctrlKey: true, shiftKey: true });
  assert.deepStrictEqual(env.calls, ["submitCurrent"]);
});

test("未绑定的组合不触发任何动作", () => {
  const env = createEnv();
  env.press({ key: "K", code: "KeyK", ctrlKey: true, shiftKey: true });
  assert.deepStrictEqual(env.calls, []);
});

/* ---------------------------- 作用域 ---------------------------- */

test("Esc 在面板未打开时不触发（scope=panel）", () => {
  const env = createEnv();
  env.win.__panelOpen = false;
  env.press({ key: "Escape", code: "Escape" });
  assert.deepStrictEqual(env.calls, []);
});

test("Esc 在面板打开时关闭面板", () => {
  const env = createEnv();
  env.win.__panelOpen = true;
  env.press({ key: "Escape", code: "Escape" });
  assert.deepStrictEqual(env.calls, ["closePanel"]);
});

/* ------------------------ 全局命令避让 ------------------------ */

test("组合与浏览器全局命令相同时放行给 Chrome，避免开关抵消", () => {
  const env = createEnv({
    globalShortcuts: [{ name: "open-prompt-panel", shortcut: "Ctrl+Shift+P" }],
  });
  env.press(CTRL_SHIFT_P);
  assert.deepStrictEqual(
    env.calls,
    [],
    "全局命令已由 background 转发，内容脚本不应重复处理",
  );
});

test("全局命令是别的组合时，页面内绑定照常生效", () => {
  const env = createEnv({
    globalShortcuts: [{ name: "open-prompt-panel", shortcut: "Ctrl+Shift+U" }],
  });
  env.press(CTRL_SHIFT_P);
  assert.deepStrictEqual(env.calls, ["togglePanel"]);
});

/* ------------------------ 自定义绑定 ------------------------ */

test("storage 中的自定义绑定优先生效，默认组合不再触发", () => {
  const env = createEnv({ shortcuts: { togglePanel: "ctrl+alt+j" } });
  env.press(CTRL_SHIFT_P);
  assert.deepStrictEqual(env.calls, [], "默认组合应已失效");
  env.press({ key: "J", code: "KeyJ", ctrlKey: true, altKey: true });
  assert.deepStrictEqual(env.calls, ["togglePanel"]);
});

test("置空的绑定等于禁用该动作", () => {
  const env = createEnv({ shortcuts: { togglePanel: "" } });
  env.press(CTRL_SHIFT_P);
  assert.deepStrictEqual(env.calls, []);
});

/* ------------------------ 输入框保护 ------------------------ */

test("在网页输入框内输入无修饰键的按键不会被拦截", () => {
  const env = createEnv();
  const input = env.win.document.createElement("input");
  env.win.document.body.appendChild(input);
  const event = new env.win.KeyboardEvent("keydown", {
    key: "p",
    code: "KeyP",
    bubbles: true,
    cancelable: true,
  });
  input.dispatchEvent(event);
  assert.deepStrictEqual(env.calls, []);
  assert.strictEqual(event.defaultPrevented, false);
});

test("在网页输入框内按带修饰键的组合仍然生效", () => {
  const env = createEnv();
  const input = env.win.document.createElement("input");
  env.win.document.body.appendChild(input);
  input.dispatchEvent(
    new env.win.KeyboardEvent("keydown", Object.assign({}, CTRL_SHIFT_P, {
      bubbles: true,
      cancelable: true,
    })),
  );
  assert.deepStrictEqual(env.calls, ["togglePanel"]);
});

test("面板打开时，在网页输入框按 Esc 不会误关面板", () => {
  const env = createEnv();
  env.win.__panelOpen = true;
  const input = env.win.document.createElement("input");
  env.win.document.body.appendChild(input);
  const event = new env.win.KeyboardEvent("keydown", {
    key: "Escape",
    code: "Escape",
    bubbles: true,
    cancelable: true,
  });
  input.dispatchEvent(event);
  assert.deepStrictEqual(env.calls, [], "输入框内的 Esc 应放行给页面");
  assert.strictEqual(event.defaultPrevented, false);
});

test("面板内部输入框按 Esc 可以关闭面板", () => {
  const env = createEnv();
  env.win.__panelOpen = true;
  const panel = env.win.document.createElement("div");
  panel.id = "prompt-injector-panel";
  const input = env.win.document.createElement("input");
  panel.appendChild(input);
  env.win.document.body.appendChild(panel);
  input.dispatchEvent(
    new env.win.KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      bubbles: true,
      cancelable: true,
    }),
  );
  assert.deepStrictEqual(env.calls, ["closePanel"]);
});

test("长按重复事件（repeat）只触发一次", () => {
  const env = createEnv();
  env.press(Object.assign({}, CTRL_SHIFT_P, { repeat: true }));
  assert.deepStrictEqual(env.calls, []);
});

test("中文输入法组字状态（isComposing）不触发快捷键", () => {
  const env = createEnv();
  env.press(
    Object.assign({}, CTRL_SHIFT_P, { isComposing: true }),
  );
  assert.deepStrictEqual(env.calls, []);
});

/* ---------------------------- 汇总 ---------------------------- */

console.log(`通过 ${passed} 项，失败 ${failed} 项`);
if (failed) {
  failures.forEach((line) => console.error("  ✗ " + line));
  process.exit(1);
}
