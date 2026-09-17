/* shared/detector.js 站点自动识别测试（jsdom）
 * 覆盖：主输入框挑优、生成的选择器可唯一定位、发送按钮识别、忽略隐藏项、标题取名。
 * 运行：node tests/detector-dom.test.js
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

// jsdom 没有布局，用 data-rect="left,top,width,height" 描述元素尺寸与位置
function createDetector(title, html) {
  const dom = new JSDOM(
    "<!doctype html><html><head><title>" +
      (title || "") +
      "</title></head><body>" +
      html +
      "</body></html>",
    { url: "https://chat.example.com/room/1", runScripts: "dangerously" },
  );
  const win = dom.window;
  win.Element.prototype.getBoundingClientRect = function () {
    const raw = this.getAttribute("data-rect");
    if (raw) {
      const nums = raw.split(",").map(Number);
      return {
        left: nums[0],
        top: nums[1],
        width: nums[2],
        height: nums[3],
        right: nums[0] + nums[2],
        bottom: nums[1] + nums[3],
      };
    }
    return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
  };
  const script = win.document.createElement("script");
  script.textContent = fs.readFileSync(
    path.join(root, "shared/detector.js"),
    "utf8",
  );
  win.document.body.appendChild(script);
  return win;
}

const CHAT_PAGE =
  '<input id="search" placeholder="搜索" data-rect="600,20,200,32" />' +
  '<div class="composer">' +
  '<div contenteditable="true" data-testid="chat-input" placeholder="给 AI 助手发送消息" data-rect="300,600,700,90"></div>' +
  '<button aria-label="发送" data-rect="1010,620,32,32"><svg></svg></button>' +
  '<button aria-label="语音输入" data-rect="970,620,32,32"><svg></svg></button>' +
  "</div>";

test("主输入框优先于搜索框等小输入框", () => {
  const win = createDetector("ChatSite", CHAT_PAGE);
  const info = win.PromptDetector.detect();
  const target = win.document.querySelector('[data-testid="chat-input"]');
  assert.strictEqual(win.document.querySelector(info.inputSelector), target);
});

test("带语义属性时直接生成属性选择器", () => {
  const win = createDetector("ChatSite", CHAT_PAGE);
  assert.strictEqual(
    win.PromptDetector.detect().inputSelector,
    'div[data-testid="chat-input"]',
  );
});

test("发送按钮按语义命中，而非同级的语音按钮", () => {
  const win = createDetector("ChatSite", CHAT_PAGE);
  const info = win.PromptDetector.detect();
  const target = win.document.querySelector('[aria-label="发送"]');
  assert.strictEqual(win.document.querySelector(info.sendSelector), target);
});

test("没有稳定属性时仍能生成唯一定位的选择器", () => {
  const html =
    '<div><div><div><textarea data-rect="200,600,600,80"></textarea></div></div></div>' +
    '<div><div><div><textarea data-rect="200,200,600,60"></textarea></div></div></div>';
  const win = createDetector("Plain", html);
  const info = win.PromptDetector.detect();
  const matched = win.document.querySelectorAll(info.inputSelector);
  assert.strictEqual(matched.length, 1, "选择器应唯一定位");
  assert.strictEqual(matched[0].tagName, "TEXTAREA");
});

test("隐藏 / 过小的输入框不参与识别", () => {
  const html =
    '<textarea data-rect="200,600,600,80" style="display:none"></textarea>' +
    '<div contenteditable="true" data-rect="10,10,40,12"></div>';
  const win = createDetector("Empty", html);
  const info = win.PromptDetector.detect();
  assert.strictEqual(info.inputSelector, "");
  assert.strictEqual(info.sendSelector, "");
});

test("站点名取页面标题的首段", () => {
  const win = createDetector("通义千问 - 你的 AI 助手", CHAT_PAGE);
  assert.strictEqual(win.PromptDetector.detect().name, "通义千问");
});

/* 内容脚本侧的自动补全：缺选择器的站点会在访问时被写回 */
function createInjectEnv(options) {
  const dom = new JSDOM(
    "<!doctype html><html><body>" +
      '<div contenteditable="true" data-testid="chat-input" data-rect="300,600,700,90"></div>' +
      '<button aria-label="发送" data-rect="1010,620,32,32"><svg></svg></button>' +
      "</body></html>",
    { url: options.url, runScripts: "dangerously" },
  );
  const win = dom.window;
  win.Element.prototype.getBoundingClientRect = function () {
    const raw = this.getAttribute("data-rect");
    if (!raw) return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
    const nums = raw.split(",").map(Number);
    return {
      left: nums[0],
      top: nums[1],
      width: nums[2],
      height: nums[3],
      right: nums[0] + nums[2],
      bottom: nums[1] + nums[3],
    };
  };

  const writes = [];
  win.chrome = {
    storage: {
      local: {
        get(defaults, callback) {
          callback(
            Object.assign({}, defaults, { customSites: options.sites || [] }),
          );
        },
        set(obj, callback) {
          writes.push(obj);
          if (callback) callback();
        },
      },
      onChanged: { addListener() {} },
    },
    runtime: {},
  };

  ["shared/detector.js", "content/inject.js"].forEach((file) => {
    const script = win.document.createElement("script");
    script.textContent = fs.readFileSync(path.join(root, file), "utf8");
    win.document.body.appendChild(script);
  });
  return { win, writes };
}

test("访问缺选择器的站点时自动写回选择器", () => {
  const { win, writes } = createInjectEnv({
    url: "https://chat.example.com/room/1",
    sites: [{ id: "s1", name: "A", pattern: "https://chat.example.com/*", enabled: true }],
  });
  win.PromptInjector.autoDetectOnce();
  assert.strictEqual(writes.length, 1, "应写回一次");
  const saved = writes[0].customSites.find((s) => s.id === "s1");
  assert.strictEqual(saved.inputSelector, 'div[data-testid="chat-input"]');
  assert.strictEqual(saved.sendSelector, 'button[aria-label="发送"]');
});

test("已有手写选择器时不覆盖", () => {
  const { win, writes } = createInjectEnv({
    url: "https://chat.example.com/room/1",
    sites: [
      { id: "s1", name: "A", pattern: "https://chat.example.com/*", inputSelector: "#custom-input", enabled: true },
    ],
  });
  win.PromptInjector.autoDetectOnce();
  assert.strictEqual(writes.length, 0, "不应覆盖用户填写的值");
});

console.log(`通过 ${passed} 项，失败 ${failed} 项`);
if (failed) {
  failures.forEach((line) => console.error("  ✗ " + line));
  process.exit(1);
}
