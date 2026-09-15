/* PromptPilot 后台服务（MV3 Service Worker）
 *
 * 职责：
 *  1. 转发浏览器级命令（在 chrome://extensions/shortcuts 里配置的全局快捷键）
 *  2. 为「自定义站点」动态注册 / 注销内容脚本，让悬浮球、面板、页面内快捷键
 *     能在用户自行添加的网页 AI 上生效（manifest 的 content_scripts 只覆盖内置站点）
 *  3. 启动 / 配置变更时，把 storage 里的站点配置与已注册脚本对齐
 *
 * 注意：主机权限由 popup 在用户点击时申请（需要用户手势），这里只负责
 * 「已授权的站点才注册」，绝不在此处弹权限框。
 */
importScripts("shared/utils.js", "shared/defaults.js");

var SCRIPT_ID_PREFIX = CONTENT_SCRIPT_ID_PREFIX;
var SCRIPT_FILES = CONTENT_SCRIPT_FILES;
var SYNC_DEBOUNCE_MS = 200;
var syncTimer = null;

/* ------------------------------ 网址规整 ------------------------------ */

// 网址规整统一走 PromptUtils，保证与 popup 申请权限时的判定完全一致
function normalizeMatchPattern(pattern) {
  return PromptUtils.normalizeMatchPattern(pattern);
}

function isValidMatchPattern(pattern) {
  return PromptUtils.isValidMatchPattern(pattern);
}

function originPatternOf(matchPattern) {
  return PromptUtils.originOfPattern(matchPattern);
}

function scriptIdFor(siteId) {
  return SCRIPT_ID_PREFIX + siteId;
}

/* ------------------------------ Promise 封装 ------------------------------ */

function readCustomSites() {
  return new Promise(function (resolve) {
    chrome.storage.local.get({ customSites: [] }, function (data) {
      resolve(data.customSites || []);
    });
  });
}

function hasOrigins(origins) {
  return new Promise(function (resolve) {
    chrome.permissions.contains({ origins: origins }, resolve);
  });
}

/* ------------------------------ 核心：同步注册 ------------------------------ */

async function syncRegisteredScripts() {
  var sites = await readCustomSites();
  var registered = (await chrome.scripting.getRegisteredContentScripts()) || [];
  var owned = registered.filter(function (script) {
    return script.id && script.id.indexOf(SCRIPT_ID_PREFIX) === 0;
  });

  var wanted = new Map();
  for (var i = 0; i < sites.length; i++) {
    var site = sites[i];
    if (!site || !site.id || site.enabled === false) continue;
    var match = normalizeMatchPattern(site.pattern);
    if (!match || !isValidMatchPattern(match)) continue;
    var origin = originPatternOf(match);
    if (!origin) continue;
    // 未授权的站点跳过：等用户在设置页点击授权后再注册
    var granted = await hasOrigins([origin]);
    if (!granted) continue;
    wanted.set(scriptIdFor(site.id), {
      id: scriptIdFor(site.id),
      matches: [match],
      js: SCRIPT_FILES,
      runAt: "document_idle",
      allFrames: false,
    });
  }

  var staleIds = [];
  owned.forEach(function (script) {
    var next = wanted.get(script.id);
    var unchanged =
      next && JSON.stringify(next.matches) === JSON.stringify(script.matches);
    if (!next || !unchanged) staleIds.push(script.id);
  });

  if (staleIds.length) {
    await chrome.scripting.unregisterContentScripts({ ids: staleIds });
  }

  var toAdd = [];
  wanted.forEach(function (script, id) {
    var exists = owned.some(function (s) {
      return s.id === id;
    });
    if (!exists || staleIds.indexOf(id) !== -1) toAdd.push(script);
  });
  if (toAdd.length) {
    await chrome.scripting.registerContentScripts(toAdd);
  }

  return { registered: wanted.size, removed: staleIds.length };
}

async function syncSafely() {
  try {
    return await syncRegisteredScripts();
  } catch (error) {
    return { error: error && error.message ? error.message : String(error) };
  }
}

// 把当前生效的浏览器级命令写入 storage，供内容脚本避开重复触发
async function refreshGlobalShortcuts() {
  try {
    var commands = (await chrome.commands.getAll()) || [];
    var list = commands
      .map(function (command) {
        return {
          name: command.name,
          description: command.description || "",
          shortcut: command.shortcut || "",
        };
      })
      .filter(function (command) {
        return !!command.shortcut;
      });
    await chrome.storage.local.set({ globalShortcuts: list });
    return list;
  } catch (error) {
    return [];
  }
}

function scheduleSync() {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(function () {
    syncTimer = null;
    syncSafely();
  }, SYNC_DEBOUNCE_MS);
}

/* ------------------------------ 命令与消息 ------------------------------ */

chrome.commands.onCommand.addListener(function (command) {
  if (command !== "open-prompt-panel") return;
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, { type: "toggle_panel" }, function () {
      // 内容脚本尚未注入时静默忽略
      void chrome.runtime.lastError;
    });
  });
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || !message.type) return;

  if (message.type === "pp_sync_sites") {
    syncSafely().then(sendResponse);
    return true;
  }

  if (message.type === "pp_refresh_global_shortcuts") {
    refreshGlobalShortcuts().then(function (list) {
      sendResponse({ ok: true, commands: list });
    });
    return true;
  }

  if (message.type === "pp_validate_site_pattern") {
    var normalized = normalizeMatchPattern(message.pattern);
    sendResponse({
      ok: !!normalized && isValidMatchPattern(normalized),
      pattern: normalized,
      origin: normalized ? originPatternOf(normalized) : "",
    });
    return;
  }

  if (message.type === "pp_revoke_site") {
    var siteId = message.siteId;
    var origin = message.origin;
    (async function () {
      if (siteId) {
        await chrome.scripting.unregisterContentScripts({
          ids: [scriptIdFor(siteId)],
        });
      }
      if (origin) {
        // 只有该 origin 不再被其它站点使用时才回收权限
        var sites = await readCustomSites();
        var stillUsed = sites.some(function (site) {
          if (!site || site.id === siteId || site.enabled === false) return false;
          return originPatternOf(normalizeMatchPattern(site.pattern)) === origin;
        });
        if (!stillUsed) {
          await chrome.permissions.remove({ origins: [origin] });
        }
      }
      sendResponse({ ok: true });
    })().catch(function (error) {
      sendResponse({
        ok: false,
        error: error && error.message ? error.message : String(error),
      });
    });
    return true;
  }
});

chrome.storage.onChanged.addListener(function (changes, areaName) {
  if (areaName === "local" && changes.customSites) {
    scheduleSync();
  }
});

chrome.runtime.onInstalled.addListener(function () {
  syncSafely();
  refreshGlobalShortcuts();
});

chrome.runtime.onStartup.addListener(function () {
  syncSafely();
  refreshGlobalShortcuts();
});
