/* 主题一致性检查
 *
 * popup/popup.css 与 content/panel-styles.js 是两套独立样式表：后者注入到
 * 第三方页面，必须把变量 scope 在 #prompt-injector-panel 内，无法共用
 * :root。因此两处配色是复制关系，容易漂移 —— 这里锁死它们的对应关系。
 *
 * 同时守住两条防回退：
 *   - Catppuccin 配色已被清除（"AI 味"的主要来源）
 *   - panel.js 不再内联 CSS，只引用 panel-styles.js 导出的常量
 *
 * 运行：node tests/theme.test.js
 */
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const popup = read("popup/popup.css");
const styles = read("content/panel-styles.js");
const panel = read("content/panel.js");

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

// 取某个选择器的声明块（CSS 变量块内无嵌套，第一个 } 即结束）
function block(src, selector) {
  const at = src.indexOf(selector);
  assert.ok(at >= 0, "未找到选择器: " + selector);
  const open = src.indexOf("{", at);
  const close = src.indexOf("}", open);
  return src.slice(open + 1, close);
}

function varOf(text, name) {
  const re = new RegExp("(?:^|[;{\\s])" + name + "\\s*:\\s*([^;}]+)");
  const m = re.exec(text);
  return m ? m[1].trim() : null;
}

// panel-styles.js 里每条规则都是一行字符串，同名变量出现两次：深色在前、浅色在后
function allVarValues(text, name) {
  const re = new RegExp(name + ":([^;!}]+)", "g");
  return [...text.matchAll(re)].map((m) => m[1].trim());
}

/* popup 语义名 → panel 语义名（层级对应关系） */
const TOKEN_PAIRS = [
  ["--bg-surface", "--pi-bg"],
  ["--bg-raised", "--pi-surface"],
  ["--bg-inset", "--pi-inset"],
  ["--text", "--pi-text"],
  ["--accent", "--pi-accent"],
];

test("深色主题：popup 与页面面板配色一致", () => {
  const dark = block(popup, ":root {");
  TOKEN_PAIRS.forEach(([popName, piName]) => {
    const expected = varOf(dark, popName);
    assert.ok(expected, "popup 缺少 " + popName);
    const inPanel = allVarValues(styles, piName)[0];
    assert.ok(inPanel, "panel-styles 缺少 " + piName);
    assert.strictEqual(
      inPanel.toLowerCase(),
      expected.toLowerCase(),
      piName + " 与 " + popName + " 不一致: " + inPanel + " vs " + expected,
    );
  });
});

test("浅色主题：popup 与页面面板配色一致", () => {
  const light = block(popup, '[data-theme="light"] {');
  TOKEN_PAIRS.forEach(([popName, piName]) => {
    const expected = varOf(light, popName);
    assert.ok(expected, "popup 浅色缺少 " + popName);
    const inPanel = allVarValues(styles, piName)[1];
    assert.ok(inPanel, "panel-styles 浅色缺少 " + piName);
    assert.strictEqual(
      inPanel.toLowerCase(),
      expected.toLowerCase(),
      piName + "(light) 与 " + popName + "(light) 不一致: " + inPanel + " vs " + expected,
    );
  });
});

test("两套主题都完整定义了成对变量", () => {
  TOKEN_PAIRS.forEach(([, piName]) => {
    const values = allVarValues(styles, piName);
    assert.strictEqual(
      values.length,
      2,
      piName + " 应恰好出现 2 次（深色 + 浅色），实际 " + values.length,
    );
  });
});

// Catppuccin Mocha / Latte 的整套色值，外加面板曾经用过的几个自定义色
const LEGACY_PALETTE = [
  "#1e1e2e", "#313244", "#181825", "#11111b", "#45475a", "#cdd6f4",
  "#a6adc8", "#6c7086", "#585b70", "#89b4fa", "#74c7ec", "#a6e3a1",
  "#f38ba8", "#f9e2af", "#cba6f7", "#bac2de",
  "#eff1f5", "#ccd0da", "#e6e9ef", "#dce0e8", "#bcc0cc", "#4c4f69",
  "#5c5f77", "#7c7f93", "#9ca0b0", "#1e66f5", "#2a6ef5", "#40a02b",
  "#d20f39", "#df8e1d", "#8839ef",
  "#171a1f", "#35434a", "#7ce7d8", "#e6eee9", "#20272b",
];

test("Catppuccin 配色已彻底移除", () => {
  const files = [
    "popup/popup.css",
    "popup/popup.html",
    "content/panel.js",
    "content/panel-styles.js",
    "content/shortcuts.js",
  ];
  const hits = [];
  files.forEach((file) => {
    const src = read(file).toLowerCase();
    LEGACY_PALETTE.forEach((color) => {
      if (src.indexOf(color) >= 0) hits.push(file + " → " + color);
    });
  });
  assert.deepStrictEqual(hits, [], "仍残留旧配色: " + hits.join(", "));
});

test("panel.js 不再内联 CSS，只引用样式常量", () => {
  assert.ok(
    !/var\s+BALL_CSS|var\s+PANEL_CSS/.test(panel),
    "panel.js 仍定义了内联 CSS 常量",
  );
  ["PP_BALL_SIZE", "PP_BALL_CSS", "PP_PANEL_CSS", "PP_NOTICE_CSS"].forEach(
    (name) => {
      assert.ok(
        panel.indexOf(name) >= 0,
        "panel.js 未引用 " + name + "（样式链路断了）",
      );
    },
  );
});

test("悬浮球直径在样式文件中单一定义", () => {
  const m = /var PP_BALL_SIZE = (\d+);/.exec(styles);
  assert.ok(m, "panel-styles.js 未定义 PP_BALL_SIZE");
  assert.ok(
    /var BALL_SIZE = PP_BALL_SIZE;/.test(panel),
    "panel.js 应通过 PP_BALL_SIZE 取值，而非硬编码",
  );
});

console.log(`通过 ${passed} 项，失败 ${failed} 项`);
if (failed) {
  failures.forEach((line) => console.error("  ✗ " + line));
  process.exit(1);
}
