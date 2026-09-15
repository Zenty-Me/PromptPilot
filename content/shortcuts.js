/* 页面内可配置快捷键
 *
 * 组合键配置存在 chrome.storage.local.shortcuts，形如：
 *   { togglePanel: "ctrl+shift+p", closePanel: "esc", ... }
 * 键名与 PromptDefaults.SHORTCUT_META 的 id 对应；空字符串表示未绑定。
 *
 * 与浏览器级命令（chrome://extensions/shortcuts）的冲突处理：
 * 全局命令会先被 Chrome 捕获并由 background 转发成 toggle_panel。如果此处再
 * 处理一次同一个组合，面板会被开→关抵消。因此 background 会把当前生效的全局
 * 组合写入 storage.globalShortcuts，本模块命中这些组合时直接放行给 Chrome。
 */
var PromptShortcuts = (function () {
  var bindings = {};
  var order = [];
  var scopeById = {};
  var globalCombos = [];

  function isEditable(target) {
    if (!target || !target.tagName) return false;
    var tag = target.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    try {
      return target.isContentEditable === true;
    } catch (e) {
      return false;
    }
  }

  function insidePanel(target) {
    return !!(
      target &&
      target.closest &&
      target.closest("#prompt-injector-panel")
    );
  }

  function applyGlobalShortcuts(list) {
    globalCombos = (list || [])
      .map(function (item) {
        var parsed = PromptUtils.parseShortcut(item && item.shortcut);
        return parsed ? PromptUtils.serializeShortcut(parsed) : "";
      })
      .filter(Boolean);
  }

  function apply(stored) {
    bindings = {};
    order = [];
    scopeById = {};
    var meta =
      (typeof PromptDefaults !== "undefined" && PromptDefaults.SHORTCUT_META) ||
      [];
    meta.forEach(function (item) {
      order.push(item.id);
      scopeById[item.id] = item.scope || "page";
      bindings[item.id] =
        typeof stored[item.id] === "string" ? stored[item.id] : item.def;
    });
  }

  function panelOpen() {
    return (
      typeof PromptPanel !== "undefined" &&
      PromptPanel.isPanelOpen &&
      PromptPanel.isPanelOpen()
    );
  }

  function runAction(id) {
    if (typeof PromptPanel === "undefined") return;
    try {
      if (id === "togglePanel") PromptPanel.togglePanel();
      else if (id === "closePanel") PromptPanel.closePanel();
      else if (id === "injectRecent") PromptPanel.injectRecent();
      else if (id === "submit") PromptPanel.submitCurrent();
      else if (id === "toggleBall") PromptPanel.toggleBall();
    } catch (e) {}
  }

  function onKeyDown(event) {
    if (!order.length) return;
    if (event.isComposing || event.repeat) return;

    var combo = PromptUtils.comboFromKeyboardEvent(event);
    if (!combo) return;

    // 交给浏览器级命令处理，避免开关互相抵消
    if (globalCombos.indexOf(combo) !== -1) return;

    var target = event.target;
    if (
      isEditable(target) &&
      !insidePanel(target) &&
      !PromptUtils.shortcutHasModifier(combo)
    ) {
      return;
    }

    for (var i = 0; i < order.length; i++) {
      var id = order[i];
      var bound = bindings[id];
      if (!bound) continue;
      if (scopeById[id] === "panel" && !panelOpen()) continue;
      if (!PromptUtils.matchShortcut(bound, event)) continue;
      event.preventDefault();
      event.stopPropagation();
      runAction(id);
      return;
    }
  }

  function load() {
    try {
      chrome.storage.local.get(
        { shortcuts: null, globalShortcuts: [] },
        function (data) {
          apply(data.shortcuts || {});
          applyGlobalShortcuts(data.globalShortcuts || []);
        },
      );
    } catch (e) {
      apply({});
    }
  }

  function init() {
    load();
    document.addEventListener("keydown", onKeyDown, true);
    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(function (changes, areaName) {
        if (areaName !== "local") return;
        if (changes.shortcuts) apply(changes.shortcuts.newValue || {});
        if (changes.globalShortcuts) {
          applyGlobalShortcuts(changes.globalShortcuts.newValue || []);
        }
      });
    }
  }

  return { init: init, reload: load };
})();

PromptShortcuts.init();
