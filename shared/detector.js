/* 站点自动识别：从当前页面 DOM 推断聊天输入框 / 发送按钮的 CSS Selector。
 *
 * 两个调用方共用本文件，所以它不能依赖 PromptUtils / PromptInjector：
 *   1. 内容脚本（content/inject.js）—— 站点已添加但没有选择器时，访问页面自动补全
 *   2. popup —— 添加站点时，如果网址正好开着，就当场探测并写进配置
 * popup 侧是 chrome.scripting.executeScript 单独注入本文件后再取 PromptDetector.detect()。
 */
var PromptDetector = (function () {
  // 生成 selector 时优先用的稳定属性；id 单独处理
  var STABLE_ATTRS = [
    "aria-label",
    "data-testid",
    "data-test-id",
    "data-id",
    "data-name",
    "name",
    "role",
  ];
  // 语义标签过长 / 带标点时不如走路径稳妥
  var MAX_ATTR_SELECTOR_LEN = 30;

  var INPUT_HINTS =
    /(消息|提问|输入|对话|聊天|发送|prompt|message|chat|ask|send|type)/i;
  var SEND_HINTS = /(发送|提交|上行|send|submit|sent)/i;
  var NOISE_HINTS =
    /(语音|录音|上传|附件|图片|关闭|删除|清空|停止|复制|voice|upload|attach|close|stop|clear|copy|mic|rewind|regenerate|edit)/i;

  /* ------------------------------ 工具 ------------------------------ */

  function escapeIdent(value) {
    if (window.CSS && window.CSS.escape) return window.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, function (c) {
      return "\\" + c;
    });
  }

  function escapeAttr(value) {
    return String(value).replace(/["\\]/g, "\\$&");
  }

  function unique(selector, target) {
    try {
      var found = document.querySelectorAll(selector);
      return found.length === 1 && found[0] === target;
    } catch (e) {
      return false;
    }
  }

  // 框架自动生成的随机 id / class（:r1:、ac7f3d...）下次刷新就变了，不能用在 selector 里
  function looksGenerated(value) {
    return /^[0-9]/.test(value) || /[0-9a-f]{8}/i.test(value) || /^[:_]/.test(value);
  }

  function attrText(el, names) {
    return names
      .map(function (name) {
        return el.getAttribute(name) || "";
      })
      .join(" ");
  }

  function isVisible(el) {
    if (!el.isConnected) return false;
    var rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    var style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return true;
  }

  /* --------------------------- selector 生成 --------------------------- */

  function ownSelector(el) {
    var id = el.getAttribute("id");
    if (id && !looksGenerated(id)) {
      var byId = "#" + escapeIdent(id);
      if (unique(byId, el)) return byId;
    }
    for (var i = 0; i < STABLE_ATTRS.length; i++) {
      var attr = STABLE_ATTRS[i];
      var value = el.getAttribute(attr);
      if (
        !value ||
        value.length > MAX_ATTR_SELECTOR_LEN ||
        looksGenerated(value)
      )
        continue;
      var selector =
        el.tagName.toLowerCase() +
        "[" +
        attr +
        '="' +
        escapeAttr(value) +
        '"]';
      if (unique(selector, el)) return selector;
    }
    return "";
  }

  function describe(el) {
    var tag = el.tagName.toLowerCase();
    var id = el.getAttribute("id");
    if (id && !looksGenerated(id)) return tag + "#" + escapeIdent(id);

    var selector = tag;
    var classes = Array.prototype.slice
      .call(el.classList)
      .filter(function (cls) {
        return cls && cls.length < 40 && !looksGenerated(cls);
      })
      .slice(0, 2);
    if (classes.length) {
      selector += "." + classes.map(escapeIdent).join(".");
    }
    var parent = el.parentElement;
    if (parent) {
      var siblings = Array.prototype.filter.call(parent.children, function (n) {
        return n.tagName === el.tagName;
      });
      if (siblings.length > 1) {
        selector += ":nth-of-type(" + (siblings.indexOf(el) + 1) + ")";
      }
    }
    return selector;
  }

  // 先用属性直击，不行再向上拼路径，并尽量丢掉外层冗余祖先
  function generateSelector(el) {
    if (!el || el.nodeType !== 1 || el === document.documentElement) return "";
    var direct = ownSelector(el);
    if (direct) return direct;

    var chain = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      chain.unshift(describe(node));
      node = node.parentElement;
    }
    if (!chain.length) return "";

    var best = chain.join(" > ");
    for (var i = 1; i < chain.length; i++) {
      var shorter = chain.slice(i).join(" > ");
      if (!unique(shorter, el)) break;
      best = shorter;
    }
    return best;
  }

  /* ------------------------------ 输入框 ------------------------------ */

  function inputCandidates() {
    var nodes = document.querySelectorAll(
      'textarea, input:not([type="button"]):not([type="submit"]):not([type="file"]), [contenteditable="true"], [role="textbox"]',
    );
    return Array.prototype.filter.call(nodes, function (el) {
      if (el.disabled || el.readOnly) return false;
      if (el.tagName === "INPUT" && el.type === "password") return false;
      return isVisible(el);
    });
  }

  function scoreInput(el) {
    var rect = el.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 20) return -1;

    var score = Math.min(rect.width, 900) / 40 + Math.min(rect.height, 240) / 24;
    var meta =
      attrText(el, [
        "placeholder",
        "aria-label",
        "data-placeholder",
        "title",
        "name",
        "id",
      ]) +
      " " +
      (el.className || "");
    if (INPUT_HINTS.test(meta)) score += 25;
    if (el.getAttribute("contenteditable") === "true") score += 8;
    if (el.tagName === "TEXTAREA") score += 8;
    if (rect.top > window.innerHeight * 0.4) score += 6; // 聊天输入通常在页面中下部
    return score;
  }

  function detectInput() {
    var candidates = inputCandidates();
    var best = null;
    var bestScore = -1;
    for (var i = 0; i < candidates.length; i++) {
      var score = scoreInput(candidates[i]);
      if (score > bestScore) {
        bestScore = score;
        best = candidates[i];
      }
    }
    return bestScore > 0 ? best : null;
  }

  /* ------------------------------ 发送按钮 ------------------------------ */

  function buttonMeta(btn) {
    return (
      attrText(btn, ["aria-label", "title", "data-testid", "id", "type"]) +
      " " +
      (btn.textContent || "") +
      " " +
      (btn.className || "")
    );
  }

  function collectButtons(inputEl) {
    var seen = [];
    var list = [];
    function push(el) {
      if (seen.indexOf(el) === -1) {
        seen.push(el);
        list.push(el);
      }
    }
    var scopes = [];
    var scope = inputEl ? inputEl.parentElement : document.body;
    for (var level = 0; scope && level < 4; level++) {
      scopes.push(scope);
      scope = scope.parentElement;
    }
    scopes.forEach(function (container) {
      if (!container || !container.querySelectorAll) return;
      Array.prototype.forEach.call(
        container.querySelectorAll("button, [role='button']"),
        push,
      );
    });
    Array.prototype.forEach.call(document.querySelectorAll("button"), push);
    return list.filter(isVisible);
  }

  function scoreSend(btn, inputEl) {
    var meta = buttonMeta(btn);
    if (NOISE_HINTS.test(meta)) return -1;
    if (btn.tagName === "BUTTON" && btn.type === "button" && !meta.trim())
      return -1;

    var score = 0;
    if (SEND_HINTS.test(meta)) score += 40;
    if (/(上行|发送|send)/i.test(btn.textContent || "")) score += 10;
    if (btn.querySelector("svg")) score += 5;
    if (inputEl) {
      var rect = btn.getBoundingClientRect();
      var inputRect = inputEl.getBoundingClientRect();
      var distance = Math.abs(rect.top - inputRect.top) +
        Math.abs(rect.left - inputRect.left);
      score -= Math.min(distance, 1200) / 60; // 离输入框越近越可能是发送
    }
    return score;
  }

  function detectSend(inputEl) {
    var buttons = collectButtons(inputEl);
    if (!buttons.length) return null;
    var best = null;
    var bestScore = 0; // 没有命中语义线索就宁可不猜，回车兜底更稳
    for (var i = 0; i < buttons.length; i++) {
      if (buttons[i].disabled) continue;
      var score = scoreSend(buttons[i], inputEl);
      if (score > bestScore) {
        bestScore = score;
        best = buttons[i];
      }
    }
    return best;
  }

  /* ------------------------------ 站点信息 ------------------------------ */

  function siteName() {
    var title = String(document.title || "").trim();
    if (!title) return "";
    var parts = title.split(/\s+[-|—–·]\s+/);
    var name = (parts[0] || title).trim();
    return name.length > 24 ? name.slice(0, 24) : name;
  }

  function detect() {
    var inputEl = detectInput();
    var sendEl = inputEl ? detectSend(inputEl) : null;
    return {
      name: siteName(),
      inputSelector: inputEl ? generateSelector(inputEl) : "",
      sendSelector: sendEl ? generateSelector(sendEl) : "",
    };
  }

  return {
    generateSelector: generateSelector,
    detectInput: detectInput,
    detectSend: detectSend,
    detect: detect,
  };
})();
