/* content/panel.js 悬浮球定位测试（jsdom）
 * 覆盖：保存的 right/bottom 换算成球体坐标、越界位置被夹回视口、
 *       窗口尺寸变化后重新夹取（否则窗口变窄时球会停在视口外点不到）。
 * 这是第一个真正把 content/panel.js 跑起来的测试，顺带守住
 * panel-styles.js → panel.js 的加载顺序（panel.js 顶层读 PP_BALL_SIZE）。
 * 运行：node tests/panel-ball.test.js
 */
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const root = path.join(__dirname, "..");
const BALL_SIZE = 44;

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

// chrome.storage.local.get 同时支持字符串 key 与 {key: default} 两种用法
function createEnv(options) {
  const opts = options || {};
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://chat.example.com/room/1",
    runScripts: "dangerously",
    pretendToBeVisual: true,
  });
  const win = dom.window;

  const store = {};
  // init() 里的 restoreBall 会在默认视口先建一次球，这里让它别抢跑
  store.showBall = false;
  if (opts.ballPos) store.ppBallPos = opts.ballPos;

  win.chrome = {
    storage: {
      local: {
        get(query, callback) {
          if (typeof query === "string") {
            callback({ [query]: store[query] });
            return;
          }
          const out = Object.assign({}, query);
          Object.keys(query || {}).forEach((key) => {
            if (store[key] !== undefined) out[key] = store[key];
          });
          callback(out);
        },
        set(obj, callback) {
          Object.assign(store, obj);
          if (callback) callback();
        },
      },
      onChanged: { addListener() {} },
    },
    runtime: { onMessage: { addListener() {} } },
  };

  // 位置计算不依赖拖拽实现，构造一个足够用的假 Draggabilly
  win.Draggabilly = function () {
    this.on = function () {};
    this.position = { x: 0, y: 0 };
    this.dragPoint = { x: 0, y: 0 };
  };

  ["content/panel-styles.js", "content/panel.js"].forEach((file) => {
    const script = win.document.createElement("script");
    script.textContent = fs.readFileSync(path.join(root, file), "utf8");
    win.document.body.appendChild(script);
  });

  return { win, store };
}

// 视口定好之后再建球，否则测的是建球那一刻的尺寸
function showBall(win) {
  win.PromptPanel.setBallVisible(true, false);
}

function setViewport(win, width, height) {
  Object.defineProperty(win, "innerWidth", {
    value: width,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(win, "innerHeight", {
    value: height,
    configurable: true,
    writable: true,
  });
}

function ballRect(win) {
  const ball = win.document.getElementById("pp-floating-ball");
  assert.ok(ball, "悬浮球应已创建");
  return {
    left: parseFloat(ball.style.left),
    top: parseFloat(ball.style.top),
    el: ball,
  };
}

function assertInsideViewport(win, label) {
  const rect = ballRect(win);
  assert.ok(
    rect.left >= 0 && rect.left + BALL_SIZE <= win.innerWidth,
    `${label}：left=${rect.left} 超出视口宽度 ${win.innerWidth}`,
  );
  assert.ok(
    rect.top >= 0 && rect.top + BALL_SIZE <= win.innerHeight,
    `${label}：top=${rect.top} 超出视口高度 ${win.innerHeight}`,
  );
}

test("保存的 right/bottom 换算成球体 left/top", () => {
  const { win } = createEnv({ ballPos: { right: 20, bottom: 80 } });
  setViewport(win, 1200, 800);
  showBall(win);

  const rect = ballRect(win);
  assert.strictEqual(rect.left, 1200 - 20 - BALL_SIZE);
  assert.strictEqual(rect.top, 800 - 80 - BALL_SIZE);
});

test("越界的位置被夹回视口内", () => {
  const { win } = createEnv({ ballPos: { right: 9999, bottom: 9999 } });
  setViewport(win, 1200, 800);
  showBall(win);

  const rect = ballRect(win);
  assert.strictEqual(rect.left, 0);
  assert.strictEqual(rect.top, 0);
  assertInsideViewport(win, "越界位置");
});

test("窗口变窄后 resize 会把球重新夹回视口", () => {
  const { win } = createEnv({ ballPos: { right: 20, bottom: 80 } });
  setViewport(win, 1200, 800);
  showBall(win);
  assertInsideViewport(win, "缩窗之前");

  setViewport(win, 260, 200);
  win.dispatchEvent(new win.Event("resize"));

  assertInsideViewport(win, "缩窗之后");
  const rect = ballRect(win);
  assert.strictEqual(rect.left, 260 - 20 - BALL_SIZE);
  assert.strictEqual(rect.top, 200 - 80 - BALL_SIZE);
});

test("窗口比悬浮球还小时不会算出负坐标", () => {
  const { win } = createEnv({ ballPos: { right: 20, bottom: 80 } });
  setViewport(win, 30, 30);
  showBall(win);

  const rect = ballRect(win);
  assert.strictEqual(rect.left, 0);
  assert.strictEqual(rect.top, 0);
});

test("窗口变大后球跟着贴到新的右下角", () => {
  const { win } = createEnv({ ballPos: { right: 20, bottom: 80 } });
  setViewport(win, 800, 600);
  showBall(win);

  setViewport(win, 1600, 1000);
  win.dispatchEvent(new win.Event("resize"));

  const rect = ballRect(win);
  assert.strictEqual(rect.left, 1600 - 20 - BALL_SIZE);
  assert.strictEqual(rect.top, 1000 - 80 - BALL_SIZE);
  assertInsideViewport(win, "放窗之后");
});

console.log(`通过 ${passed} 项，失败 ${failed} 项`);
if (failed) {
  failures.forEach((line) => console.error("  ✗ " + line));
  process.exit(1);
}
