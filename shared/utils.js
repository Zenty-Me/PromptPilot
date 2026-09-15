var PromptUtils = (function () {
  function extractVariables(content) {
    var regex = /\{\{([^}]+)\}\}/g;
    var variables = [];
    var seen = {};
    var match;
    while ((match = regex.exec(content)) !== null) {
      var parts = match[1].split(":");
      var name = parts[0].trim();
      var defaultValue =
        parts.length > 1 ? parts.slice(1).join(":").trim() : "";
      if (!seen[name]) {
        seen[name] = true;
        variables.push({
          name: name,
          defaultValue: defaultValue,
          raw: match[0],
        });
      }
    }
    return variables;
  }

  function fillTemplate(content, values) {
    return content.replace(/\{\{([^}]+)\}\}/g, function (match) {
      var inner = match.slice(2, -2);
      var parts = inner.split(":");
      var name = parts[0].trim();
      if (values[name] !== undefined && values[name] !== "") {
        return values[name];
      }
      if (parts.length > 1) {
        return parts.slice(1).join(":").trim();
      }
      return match;
    });
  }

  function hasVariables(content) {
    return /\{\{[^}]+\}\}/.test(content);
  }

  function escapeHtml(str) {
    if (typeof DOMPurify !== "undefined" && DOMPurify.escape) {
      return DOMPurify.escape(str);
    }
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;");
  }

  function generateId(prefix) {
    return prefix + "_" + nanoid(10);
  }

  /* ------------------------------------------------------------------ *
   * 网址 / match pattern 工具
   * background 的动态脚本注册与 popup 的权限申请必须用同一套规则，
   * 否则会出现「popup 申请了权限、background 却认为网址非法」的错位。
   * ------------------------------------------------------------------ */

  // 规整为合法的 Chrome match pattern；无法规整返回 ""
  function normalizeMatchPattern(pattern) {
    var value = String(pattern || "").trim();
    if (!value) return "";
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
      value = "https://" + value;
    }
    var matched = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)(.*)$/i.exec(value);
    if (!matched) return "";
    var scheme = matched[1].toLowerCase();
    if (scheme !== "http" && scheme !== "https") return "";
    var host = matched[2];
    var path = matched[3].split("?")[0].split("#")[0];
    if (!path) path = "/*";
    return scheme + "://" + host + path;
  }

  function isValidMatchPattern(pattern) {
    if (!/^https?:\/\//i.test(pattern)) return false;
    var rest = pattern.replace(/^https?:\/\//i, "");
    var slash = rest.indexOf("/");
    if (slash === -1) return false;
    var host = rest.slice(0, slash);
    var path = rest.slice(slash);
    if (path.charAt(0) !== "/") return false;
    if (host !== "*" && !/^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)*(:\d+)?$/i.test(host)) {
      return false;
    }
    return true;
  }

  // match pattern -> 申请权限用的 origin（https://example.com/*）
  function originOfPattern(pattern) {
    var value = String(pattern || "").trim();
    if (!value) return "";
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
      value = "https://" + value;
    }
    var matched = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)/i.exec(value);
    if (!matched) return "";
    var scheme = matched[1].toLowerCase();
    if (scheme !== "http" && scheme !== "https") return "";
    return scheme + "://" + matched[2] + "/*";
  }

  /* ------------------------------------------------------------------ *
   * 快捷键工具
   * 组合键统一序列化为小写字符串："ctrl+shift+p"
   * 修饰键顺序固定为 ctrl → alt → shift → meta，最后是主键。
   * ------------------------------------------------------------------ */

  var MODIFIER_ALIAS = {
    control: "ctrl",
    ctrl: "ctrl",
    option: "alt",
    alt: "alt",
    shift: "shift",
    command: "meta",
    cmd: "meta",
    meta: "meta",
    super: "meta",
    win: "meta",
  };

  // 浏览器级保留组合：网页 / 扩展脚本无法拦截，录制时必须拒绝
  var RESERVED_SHORTCUTS = [
    "ctrl+t",
    "ctrl+n",
    "ctrl+w",
    "ctrl+q",
    "ctrl+shift+t",
    "ctrl+shift+n",
    "ctrl+shift+w",
    "ctrl+shift+q",
    "ctrl+tab",
    "ctrl+shift+tab",
    "ctrl+shift+esc",
    "ctrl+alt+delete",
    "f11",
    "f12",
    "meta+w",
    "meta+t",
    "meta+n",
    "meta+q",
    "meta+tab",
    "meta+shift+tab",
    "meta+space",
  ];

  function normalizeKeyToken(token) {
    if (token === "escape") return "esc";
    if (token === " " || token === "space" || token === "spacebar")
      return "space";
    if (token.indexOf("arrow") === 0) return token.slice(5);
    return token;
  }

  function parseShortcut(combo) {
    if (!combo) return null;
    var tokens = String(combo)
      .toLowerCase()
      .split("+")
      .map(function (t) {
        return t.trim();
      })
      .filter(Boolean);
    if (!tokens.length) return null;

    var parsed = { ctrl: false, alt: false, shift: false, meta: false, key: "" };
    for (var i = 0; i < tokens.length; i++) {
      var modifier = MODIFIER_ALIAS[tokens[i]];
      if (modifier) {
        parsed[modifier] = true;
        continue;
      }
      // 主键必须是最后一个 token，否则视为格式错误
      if (i !== tokens.length - 1) return null;
      parsed.key = normalizeKeyToken(tokens[i]);
    }
    return parsed.key ? parsed : null;
  }

  function serializeShortcut(parsed) {
    if (!parsed || !parsed.key) return "";
    var parts = [];
    if (parsed.ctrl) parts.push("ctrl");
    if (parsed.alt) parts.push("alt");
    if (parsed.shift) parts.push("shift");
    if (parsed.meta) parts.push("meta");
    parts.push(parsed.key);
    return parts.join("+");
  }

  function shortcutHasModifier(shortcut) {
    var parsed =
      typeof shortcut === "string" ? parseShortcut(shortcut) : shortcut;
    return !!(parsed && (parsed.ctrl || parsed.alt || parsed.shift || parsed.meta));
  }

  // 用 e.code 推导主键，避免 Shift+1 变成 "!"、Shift+P 变成大写等歧义
  function keyFromKeyboardEvent(event) {
    var code = event.code || "";
    if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    if (/^Numpad[0-9]$/.test(code)) return code.slice(6);

    var key = (event.key || "").toLowerCase();
    if (!key) return "";
    if (key === " " || key === "spacebar") return "space";
    if (key === "escape") return "esc";
    if (key.indexOf("arrow") === 0) return key.slice(5);
    return key;
  }

  function comboFromKeyboardEvent(event) {
    var key = keyFromKeyboardEvent(event);
    if (!key || MODIFIER_ALIAS[key]) return ""; // 只按了修饰键
    var parts = [];
    if (event.ctrlKey) parts.push("ctrl");
    if (event.altKey) parts.push("alt");
    if (event.shiftKey) parts.push("shift");
    if (event.metaKey) parts.push("meta");
    parts.push(key);
    return parts.join("+");
  }

  function matchShortcut(combo, event) {
    var parsed = typeof combo === "string" ? parseShortcut(combo) : combo;
    if (!parsed || !parsed.key) return false;
    if (!!event.ctrlKey !== parsed.ctrl) return false;
    if (!!event.altKey !== parsed.alt) return false;
    if (!!event.shiftKey !== parsed.shift) return false;
    if (!!event.metaKey !== parsed.meta) return false;
    return keyFromKeyboardEvent(event) === parsed.key;
  }

  var KEY_LABELS = {
    esc: "Esc",
    space: "Space",
    enter: "Enter",
    tab: "Tab",
    backspace: "Backspace",
    delete: "Delete",
    up: "↑",
    down: "↓",
    left: "←",
    right: "→",
    home: "Home",
    end: "End",
    pageup: "PageUp",
    pagedown: "PageDown",
  };

  function formatShortcut(combo) {
    var parsed = typeof combo === "string" ? parseShortcut(combo) : combo;
    if (!parsed || !parsed.key) return "未设置";
    var parts = [];
    if (parsed.ctrl) parts.push("Ctrl");
    if (parsed.alt) parts.push("Alt");
    if (parsed.shift) parts.push("Shift");
    if (parsed.meta) parts.push("Meta");
    var key = parsed.key;
    parts.push(KEY_LABELS[key] || key.toUpperCase());
    return parts.join(" + ");
  }

  /**
   * 校验一个组合键能否绑定到某个动作。
   * @param {string} combo 原始输入
   * @param {{scope?:string, bindings?:Object, selfId?:string, names?:Object}} options
   * @returns {{ok:boolean, combo?:string, reason?:string}}
   */
  function validateShortcut(combo, options) {
    options = options || {};
    var value = String(combo || "").trim().toLowerCase();
    if (!value) return { ok: true, combo: "" }; // 空值 = 不绑定

    var parsed = parseShortcut(value);
    if (!parsed || !parsed.key) {
      return { ok: false, reason: "无法识别该组合键" };
    }
    var normalized = serializeShortcut(parsed);

    if (RESERVED_SHORTCUTS.indexOf(normalized) !== -1) {
      return { ok: false, reason: "该组合被浏览器占用，无法拦截" };
    }
    if (!shortcutHasModifier(parsed) && options.scope === "page") {
      return { ok: false, reason: "网页全局快捷键必须包含 Ctrl / Alt / Shift / Meta" };
    }
    if (
      !shortcutHasModifier(parsed) &&
      !/^f\d{1,2}$/.test(parsed.key) &&
      parsed.key !== "esc"
    ) {
      return { ok: false, reason: "为避免影响正常输入，请至少搭配一个修饰键" };
    }

    var bindings = options.bindings || {};
    for (var id in bindings) {
      if (id === options.selfId) continue;
      var other = parseShortcut(bindings[id]);
      if (other && serializeShortcut(other) === normalized) {
        var label = (options.names && options.names[id]) || id;
        return { ok: false, reason: "与「" + label + "」冲突" };
      }
    }
    return { ok: true, combo: normalized };
  }

  return {
    extractVariables: extractVariables,
    fillTemplate: fillTemplate,
    hasVariables: hasVariables,
    escapeHtml: escapeHtml,
    generateId: generateId,
    normalizeMatchPattern: normalizeMatchPattern,
    isValidMatchPattern: isValidMatchPattern,
    originOfPattern: originOfPattern,
    parseShortcut: parseShortcut,
    serializeShortcut: serializeShortcut,
    shortcutHasModifier: shortcutHasModifier,
    keyFromKeyboardEvent: keyFromKeyboardEvent,
    comboFromKeyboardEvent: comboFromKeyboardEvent,
    matchShortcut: matchShortcut,
    formatShortcut: formatShortcut,
    validateShortcut: validateShortcut,
  };
})();
