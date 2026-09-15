/* content/inject.js 自定义站点匹配行为测试（jsdom）
 * 覆盖：pattern 特异度排序、enabled 过滤、自定义选择器优先于内置与通用探测。
 * 运行：node tests/inject-dom.test.js
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

function createEnv(options) {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="generic" contenteditable="true"></div>' +
      '<textarea id="custom-input"></textarea>' +
      '<button id="send-btn" aria-label="Send"></button></body></html>',
    { url: options.url, runScripts: "dangerously" },
  );
  const win = dom.window;

  win.chrome = {
    storage: {
      local: {
        get(defaults, callback) {
          callback(
            Object.assign({}, defaults, { customSites: options.sites || [] }),
          );
        },
        set(obj, callback) {
          if (callback) callback();
        },
      },
      onChanged: { addListener() {} },
    },
  };

  const script = win.document.createElement("script");
  script.textContent = fs.readFileSync(path.join(root, "content/inject.js"), "utf8");
  win.document.body.appendChild(script);

  return win;
}

const URL_A = "https://chat.example.com/room/123";

test("命中当前网址的自定义站点", () => {
  const win = createEnv({
    url: URL_A,
    sites: [
      { id: "s1", name: "A", pattern: "https://chat.example.com/*", inputSelector: "#custom-input", enabled: true },
    ],
  });
  const site = win.PromptInjector.getCustomSite();
  assert.ok(site, "应命中");
  assert.strictEqual(site.id, "s1");
});

test("多个命中时 pattern 更长（更具体）的优先", () => {
  const win = createEnv({
    url: URL_A,
    sites: [
      { id: "broad", name: "宽泛", pattern: "https://*.example.com/*", inputSelector: "#custom-input", enabled: true },
      { id: "exact", name: "精确", pattern: "https://chat.example.com/room/*", inputSelector: "#custom-input", enabled: true },
    ],
  });
  assert.strictEqual(win.PromptInjector.getCustomSite().id, "exact");
});

test("enabled 为 false 的站点不参与匹配", () => {
  const win = createEnv({
    url: URL_A,
    sites: [
      { id: "s1", name: "A", pattern: "https://chat.example.com/*", inputSelector: "#custom-input", enabled: false },
    ],
  });
  assert.strictEqual(win.PromptInjector.getCustomSite(), null);
});

test("旧数据缺少 enabled 字段时视为启用", () => {
  const win = createEnv({
    url: URL_A,
    sites: [
      { id: "legacy", name: "旧数据", pattern: "https://chat.example.com/*", inputSelector: "#custom-input" },
    ],
  });
  assert.strictEqual(win.PromptInjector.getCustomSite().id, "legacy");
});

test("网址不匹配时返回 null", () => {
  const win = createEnv({
    url: "https://other.site.com/",
    sites: [
      { id: "s1", name: "A", pattern: "https://chat.example.com/*", inputSelector: "#custom-input", enabled: true },
    ],
  });
  assert.strictEqual(win.PromptInjector.getCustomSite(), null);
});

test("自定义站点的 inputSelector 优先于通用探测", () => {
  const win = createEnv({
    url: URL_A,
    sites: [
      { id: "s1", name: "A", pattern: "https://chat.example.com/*", inputSelector: "#custom-input", enabled: true },
    ],
  });
  assert.strictEqual(win.PromptInjector.findInputElement().id, "custom-input");
});

test("无自定义站点时回退到通用探测", () => {
  const win = createEnv({ url: URL_A, sites: [] });
  // jsdom 无布局，getBoundingClientRect 全 0，通用探测会认为元素过小而返回 null
  assert.strictEqual(win.PromptInjector.findInputElement(), null);
});

test("发送按钮优先使用自定义 sendSelector", () => {
  const win = createEnv({
    url: URL_A,
    sites: [
      {
        id: "s1",
        name: "A",
        pattern: "https://chat.example.com/*",
        inputSelector: "#custom-input",
        sendSelector: "#send-btn",
        enabled: true,
      },
    ],
  });
  assert.strictEqual(win.PromptInjector.findSendButton().id, "send-btn");
});

test("submitCurrent 点击发送按钮", () => {
  const win = createEnv({
    url: URL_A,
    sites: [
      {
        id: "s1",
        name: "A",
        pattern: "https://chat.example.com/*",
        inputSelector: "#custom-input",
        sendSelector: "#send-btn",
        enabled: true,
      },
    ],
  });
  let clicked = 0;
  win.document.getElementById("send-btn").addEventListener("click", () => {
    clicked += 1;
  });
  assert.strictEqual(win.PromptInjector.submitCurrent(), true);
  assert.strictEqual(clicked, 1);
});

console.log(`通过 ${passed} 项，失败 ${failed} 项`);
if (failed) {
  failures.forEach((line) => console.error("  ✗ " + line));
  process.exit(1);
}
