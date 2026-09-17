/* shared/utils.js 网址匹配能力测试
 * 覆盖：「注入失败自动修复」与站点列表共用的一套站点挑选规则
 * 运行：node tests/site-match.test.js
 */
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(root, "shared/utils.js"), "utf8"),
  sandbox,
);
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

const SITES = [
  { id: "broad", pattern: "https://*.example.com/*", enabled: true },
  { id: "exact", pattern: "https://chat.example.com/room/*", enabled: true },
  { id: "off", pattern: "https://off.test/*", enabled: false },
  { id: "legacy", pattern: "https://legacy.test/*" },
];

test("多个命中时取 pattern 更长（更具体）的站点", () => {
  const site = U.matchSiteForUrl(SITES, "https://chat.example.com/room/123");
  assert.strictEqual(site && site.id, "exact");
});

test("子域命中不了精确规则时回落到宽泛规则", () => {
  const site = U.matchSiteForUrl(SITES, "https://chat.example.com/app");
  assert.strictEqual(site && site.id, "broad");
});

test("enabled 为 false 的站点不参与匹配", () => {
  const site = U.matchSiteForUrl(SITES, "https://off.test/x");
  assert.strictEqual(site, null);
});

test("缺少 enabled 字段的旧数据视为启用", () => {
  const site = U.matchSiteForUrl(SITES, "https://legacy.test/a/b");
  assert.strictEqual(site && site.id, "legacy");
});

test("* 通配 * .example.com 也命中多级子域", () => {
  const site = U.matchSiteForUrl(SITES, "https://a.b.example.com/deep/path");
  assert.strictEqual(site && site.id, "broad");
});

test("协议不同不命中", () => {
  const site = U.matchSiteForUrl(SITES, "http://chat.example.com/room/1");
  assert.strictEqual(site, null);
});

test("网址不匹配时返回 null", () => {
  const site = U.matchSiteForUrl(SITES, "https://other.site.com/room/1");
  assert.strictEqual(site, null);
});

test("foo/* 覆盖同级精确路径", () => {
  const site = U.matchSiteForUrl(
    [{ id: "p", pattern: "https://x.dev/chat/*", enabled: true }],
    "https://x.dev/chat",
  );
  assert.strictEqual(site && site.id, "p");
});

test("带端口与 query 的网址照常匹配", () => {
  const site = U.matchSiteForUrl(
    [{ id: "port", pattern: "https://app.dev/*", enabled: true }],
    "https://app.dev:8443/chat?a=1#frag",
  );
  assert.strictEqual(site && site.id, "port");
});

test("站点列表为空时返回 null", () => {
  assert.strictEqual(U.matchSiteForUrl([], "https://chat.example.com/"), null);
  assert.strictEqual(U.matchSiteForUrl(undefined, "https://chat.example.com/"), null);
});

console.log(`通过 ${passed} 项，失败 ${failed} 项`);
if (failed) {
  failures.forEach((line) => console.error("  ✗ " + line));
  process.exit(1);
}
