/* popup 交互测试（jsdom）
 * 覆盖四类「把能力接到 UI」的行为：标签点击筛选、追加注入、注入失败的自愈出口、
 * 未授权站点的补救按钮。
 * 运行：node tests/popup-dom.test.js
 */
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = path.join(__dirname, "..");
const readSrc = (p) => fs.readFileSync(path.join(root, p), "utf8");

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

const SITE_URL = "https://chat.example.com/room/123";

function createPopup(options) {
  options = options || {};
  const html = readSrc("popup/popup.html").replace(
    /<script[\s\S]*?<\/script>/g,
    "",
  );
  const dom = new JSDOM(html, {
    url: "chrome-extension://pp-test/popup/popup.html",
    runScripts: "dangerously",
    pretendToBeVisual: true,
  });
  const win = dom.window;

  const store = {
    initialized: true,
    categories: [{ id: "cat1", name: "写作", icon: "✍️", order: 0 }],
    prompts: [
      {
        id: "p1",
        title: "改写邮件",
        content: "请把这段话改写得礼貌一点",
        tags: ["邮件", "写作"],
        categoryId: "cat1",
        pinned: false,
        usageCount: 0,
        updatedAt: 1000,
      },
    ],
    customSites: options.sites || [],
    sortBy: "updatedAt",
    sortOrder: "desc",
    promptOrder: {},
    theme: "dark",
    viewMode: "list",
    shortcuts: null,
    globalShortcuts: [],
  };

  const calls = {
    sent: [],
    executed: [],
    permissionRequests: [],
    reloads: [],
    closed: 0,
  };

  const grantedOrigins = new Set(options.grantedOrigins || []);
  const detectResult = options.detectResult === undefined
    ? { name: "Example Chat", inputSelector: "#prompt-input", sendSelector: "#send" }
    : options.detectResult;
  const activeTab = { id: 7, url: options.tabUrl || SITE_URL, title: "Example" };
  // 默认注入失败，方便验证自愈；injectFailsFirst 用于验证"修复后重试成功"
  let injectCount = 0;
  function injectResponse() {
    injectCount += 1;
    if (options.injectSuccess) return { success: true };
    if (options.injectFailsFirst) return { success: injectCount > 1 };
    return { success: false };
  }

  const data = () => Object.assign({}, store);

  win.chrome = {
    storage: {
      local: {
        get(defaults, callback) {
          const merged = Object.assign({}, defaults);
          Object.keys(merged).forEach((key) => {
            if (store[key] !== undefined) merged[key] = store[key];
          });
          callback(merged);
        },
        set(obj, callback) {
          Object.keys(obj).forEach((key) => {
            store[key] = obj[key];
          });
          if (callback) callback();
        },
      },
      onChanged: { addListener() {} },
    },
    runtime: {
      lastError: null,
      sendMessage(message, callback) {
        calls.sent.push(message);
        if (callback) callback();
      },
    },
    tabs: {
      query(query, callback) {
        callback(query && query.currentWindow ? [activeTab] : [activeTab]);
      },
      sendMessage(tabId, message, callback) {
        calls.sent.push(message);
        callback(injectResponse());
      },
      reload(id) {
        calls.reloads.push(id);
      },
      create() {},
    },
    scripting: {
      executeScript(opts, callback) {
        calls.executed.push(opts);
        const results = opts.func
          ? [{ result: detectResult }]
          : [{ frameId: 0 }];
        // detector 的探测函数返回的是 detect() 结果本身
        callback(opts.func ? [detectResult] : results);
      },
    },
    permissions: {
      contains(query, callback) {
        callback(query.origins.every((o) => grantedOrigins.has(o)));
      },
      request(query, callback) {
        calls.permissionRequests.push(query.origins[0]);
        query.origins.forEach((o) => grantedOrigins.add(o));
        callback(true);
      },
    },
    extension: { getViews() { return []; } }, // 模拟侧边栏：不应自动关闭窗口
    commands: { getAll(callback) { callback([]); } },
    sidePanel: { open() {} },
  };

  win.close = function () {
    calls.closed += 1;
  };

  const files = [
    "lib/nanoid.js",
    "lib/purify.min.js",
    "lib/sortable.min.js",
    "lib/notyf.min.js",
    "lib/hotkeys-js.min.js",
    "lib/lucide.min.js",
    "shared/utils.js",
    "shared/defaults.js",
    "popup/storage.js",
    "popup/render.js",
    "popup/editor.js",
    "popup/app.js",
  ];
  files.forEach((file) => {
    const el = win.document.createElement("script");
    el.textContent = readSrc(file);
    win.document.body.appendChild(el);
  });

  win.App.init();
  return { win, store, calls, grantedOrigins, detectResult };
}

function click(win, el, init) {
  el.dispatchEvent(
    new win.MouseEvent("click", Object.assign({ bubbles: true }, init)),
  );
}

function openContextMenu(win) {
  const item = win.document.querySelector(".prompt-item");
  item.dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true }));
}

/* ------------------------------ ④ 标签点击筛选 ------------------------------ */

test("点击标签把标签名填进搜索框", () => {
  const { win } = createPopup();
  const tag = win.document.querySelector('.tag[data-tag="邮件"]');
  assert.ok(tag, "应渲染出可点击的标签");
  click(win, tag);
  assert.strictEqual(win.document.getElementById("search-input").value, "邮件");
});

test("再次点击同一标签清空搜索", () => {
  const { win } = createPopup();
  const tag = win.document.querySelector('.tag[data-tag="邮件"]');
  click(win, tag);
  click(win, win.document.querySelector('.tag[data-tag="邮件"]'));
  assert.strictEqual(win.document.getElementById("search-input").value, "");
});

/* ------------------------------ ③ 追加注入 ------------------------------ */

test("右键菜单「追加到现有内容」发送的 mode 是 append", () => {
  const { win, calls } = createPopup({ injectSuccess: true });
  openContextMenu(win);
  const menuItem = win.document.querySelector(
    '#context-menu [data-action="inject-append"]',
  );
  assert.ok(menuItem, "右键菜单应有追加注入项");
  click(win, menuItem);
  const message = calls.sent.find((m) => m.type === "inject_prompt");
  assert.ok(message, "应发出注入消息");
  assert.strictEqual(message.mode, "append");
});

test("普通注入的 mode 是 replace", () => {
  const { win, calls } = createPopup({ injectSuccess: true });
  openContextMenu(win);
  click(win, win.document.querySelector('#context-menu [data-action="inject"]'));
  const message = calls.sent.find((m) => m.type === "inject_prompt");
  assert.strictEqual(message.mode, "replace");
});

/* ------------------------------ ① 注入失败的自愈出口 ------------------------------ */

test("注入失败后弹出可操作的行动条", () => {
  const { win } = createPopup({ injectSuccess: false });
  const item = win.document.querySelector(".prompt-item");
  click(win, item.querySelector('[data-action="inject"]'));
  const bar = win.document.getElementById("action-bar");
  assert.ok(!bar.classList.contains("hidden"), "应显示行动条");
  assert.ok(
    win.document.getElementById("action-bar-text").textContent.indexOf(
      "chat.example.com",
    ) !== -1,
    "行动条应说明是哪个页面",
  );
  assert.strictEqual(
    win.document.getElementById("action-bar-btn").textContent,
    "识别此页面",
  );
});

test("点行动条按钮会在页面上跑探测器并写回站点配置", () => {
  const { win, store, calls, detectResult } = createPopup({
    injectFailsFirst: true,
  });
  const item = win.document.querySelector(".prompt-item");
  click(win, item.querySelector('[data-action="inject"]'));
  click(win, win.document.getElementById("action-bar-btn"));

  assert.strictEqual(
    win.document.getElementById("action-bar").classList.contains("hidden"),
    true,
    "点了就该收起",
  );
  assert.ok(
    calls.executed.some((opts) => {
      return Array.isArray(opts.files) && opts.files[0] === "shared/detector.js";
    }),
    "应先注入探测器",
  );

  const site = (store.customSites || []).find(function (s) {
    return s.pattern === "https://chat.example.com/room/*";
  });
  assert.ok(site, "应新增对应站点，实际 " + JSON.stringify(store.customSites));
  assert.strictEqual(site.inputSelector, detectResult.inputSelector);
  assert.strictEqual(site.sendSelector, detectResult.sendSelector);
});

test("自动识别后重试注入：弹窗里错误也不会重复弹出行动条", () => {
  const { win, calls } = createPopup({ injectSuccess: false });
  const item = win.document.querySelector(".prompt-item");
  click(win, item.querySelector('[data-action="inject"]'));
  click(win, win.document.getElementById("action-bar-btn"));
  const retries = calls.sent.filter((m) => m.type === "inject_prompt").length;
  assert.strictEqual(retries, 2, "识别后应自动重试一次");
});

test("注入成功后不会残留行动条，侧边栏里也不自动关窗口", () => {
  const { win, calls } = createPopup({ injectSuccess: true });
  win.document.getElementById("action-bar").classList.remove("hidden");
  click(win, win.document.querySelector('.prompt-item [data-action="inject"]'));
  assert.ok(
    win.document.getElementById("action-bar").classList.contains("hidden"),
  );
  assert.strictEqual(calls.closed, 0, "侧边栏不应调用 window.close");
});

/* ------------------------------ ② 未授权站点的授权入口 ------------------------------ */

test("未授权站点会露出授权按钮，点击后申请主机权限", () => {
  const { win, calls } = createPopup({
    sites: [
      {
        id: "site1",
        name: "Example",
        pattern: "https://chat.example.com/*",
        inputSelector: "#prompt-input",
        enabled: true,
      },
    ],
  });
  win.document.getElementById("btn-settings").dispatchEvent(
    new win.MouseEvent("click", { bubbles: true }),
  );
  const probe = win.document.createElement("div");
  win.PromptRender.renderCustomSiteList(
    [
      {
        id: "site1",
        name: "Example",
        pattern: "https://chat.example.com/*",
        inputSelector: "#prompt-input",
        enabled: true,
      },
    ],
    probe,
  );
  // 配好选择器的站点也必须带全操作区（曾因三元没加括号整段掉进 else 分支）
  assert.ok(probe.querySelector('[data-site-grant="site1"]'), "应有授权按钮");
  assert.ok(probe.querySelector('[data-site-edit="site1"]'), "应有编辑按钮");
  assert.ok(probe.querySelector('[data-site-delete="site1"]'), "应有删除按钮");
  assert.ok(probe.querySelector('[data-site-toggle="site1"]'), "应有启停开关");

  const grantBtn = win.document.querySelector('[data-site-grant="site1"]');
  assert.ok(grantBtn, "应渲染授权按钮");
  assert.ok(!grantBtn.classList.contains("hidden"), "未授权时应可见");
  click(win, grantBtn);
  assert.deepStrictEqual(calls.permissionRequests, [
    "https://chat.example.com/*",
  ]);
});

test("已授权的站点不再显示授权按钮", () => {
  const { win } = createPopup({
    grantedOrigins: ["https://chat.example.com/*"],
    sites: [
      {
        id: "site1",
        name: "Example",
        pattern: "https://chat.example.com/*",
        inputSelector: "#prompt-input",
        enabled: true,
      },
    ],
  });
  win.document.getElementById("btn-settings").dispatchEvent(
    new win.MouseEvent("click", { bubbles: true }),
  );
  const grantBtn = win.document.querySelector('[data-site-grant="site1"]');
  assert.ok(grantBtn.classList.contains("hidden"), "已授权应藏起入口");
});

console.log(`通过 ${passed} 项，失败 ${failed} 项`);
if (failed) {
  failures.forEach((line) => console.error("  ✗ " + line));
  process.exit(1);
}
