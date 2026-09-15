var PromptInjector = (function () {
  var customSites = [];
  var INPUT_SELECTORS = {
    "chatgpt.com": [
      "#prompt-textarea",
      'div[contenteditable="true"][data-placeholder]',
      'textarea[data-id="root"]',
    ],
    "chat.openai.com": [
      "#prompt-textarea",
      'div[contenteditable="true"][data-placeholder]',
      'textarea[data-id="root"]',
    ],
    "claude.ai": [
      'div.ProseMirror[contenteditable="true"]',
      'div[contenteditable="true"].ProseMirror',
      '[data-testid="chat-input"] div[contenteditable="true"]',
    ],
    "gemini.google.com": [
      'div.ql-editor[contenteditable="true"]',
      'div.input-area-container div[contenteditable="true"]',
      'rich-textarea div[contenteditable="true"]',
    ],
    "chat.deepseek.com": [
      'textarea[data-id="root"]',
      "#chat-input",
      'div[contenteditable="true"]',
    ],
    "tongyi.aliyun.com": [
      'div[contenteditable="true"]',
      "textarea.chat-input",
      "#chat-input",
    ],
    "kimi.moonshot.cn": [
      'div[contenteditable="true"]',
      "textarea.chat-input",
      ".chat-input textarea",
    ],
    "chat.baidu.com": [
      'div[contenteditable="true"]',
      "textarea.chat-input",
      "#chat-input",
    ],
    "chat.zhipu.ai": [
      'div[contenteditable="true"]',
      'textarea[data-id="root"]',
      "#chat-input",
    ],
    "www.doubao.com": [
      'div[contenteditable="true"]',
      'textarea[data-id="root"]',
      "#chat-input",
    ],
  };

  try {
    chrome.storage.local.get({ customSites: [] }, function (data) {
      customSites = data.customSites || [];
    });
    chrome.storage.onChanged.addListener(function (changes, areaName) {
      if (areaName === "local" && changes.customSites) {
        customSites = changes.customSites.newValue || [];
      }
    });
  } catch (e) {}

  // 返回当前页面命中的自定义站点，按 pattern 长度降序（越具体越优先）
  function getMatchingSites() {
    var href = window.location.href;
    var host = window.location.hostname;
    return customSites
      .filter(function (site) {
        if (!site || site.enabled === false) return false;
        var pattern = String(site.pattern || "").trim();
        if (!pattern) return false;
        var regex;
        try {
          regex = new RegExp(
            "^" +
              pattern
                .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
                .replace(/\*/g, ".*") +
              "$",
            "i",
          );
        } catch (e) {
          return false;
        }
        return regex.test(href) || regex.test(host);
      })
      .sort(function (a, b) {
        return String(b.pattern || "").length - String(a.pattern || "").length;
      });
  }

  function getCustomSite() {
    var matched = getMatchingSites();
    return matched.length ? matched[0] : null;
  }

  function querySelectorSafe(selector) {
    if (!selector) return null;
    try {
      return document.querySelector(selector);
    } catch (e) {
      return null;
    }
  }

  function getHostname() {
    return window.location.hostname;
  }

  function findInputElement() {
    var customSite = getCustomSite();
    var customInput = customSite && querySelectorSafe(customSite.inputSelector);
    if (customInput) return customInput;
    var hostname = getHostname();
    var selectors = INPUT_SELECTORS[hostname];
    if (selectors) {
      for (var i = 0; i < selectors.length; i++) {
        var el = document.querySelector(selectors[i]);
        if (el) return el;
      }
    }
    return findGenericInput();
  }

  function findGenericInput() {
    var genericSelectors = [
      'div[contenteditable="true"]',
      "textarea",
      '[role="textbox"]',
      '[contenteditable="true"]',
    ];
    for (var i = 0; i < genericSelectors.length; i++) {
      var elements = document.querySelectorAll(genericSelectors[i]);
      for (var j = 0; j < elements.length; j++) {
        var rect = elements[j].getBoundingClientRect();
        if (rect.width > 100 && rect.height > 20) {
          return elements[j];
        }
      }
    }
    return null;
  }

  function selectAllContent(element) {
    try {
      var range = document.createRange();
      range.selectNodeContents(element);
      var selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    } catch (e) {
      document.execCommand("selectAll", false, null);
    }
  }

  function placeCaretAtEnd(element) {
    try {
      var range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      var selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    } catch (e) {}
  }

  function setFormFieldValue(element, value, append) {
    var prototype =
      element.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    var descriptor =
      prototype && Object.getOwnPropertyDescriptor(prototype, "value");
    var next = value;
    if (append) {
      var current = element.value || "";
      next = current && !/\s$/.test(current) ? current + "\n" + value : current + value;
    }
    if (descriptor && descriptor.set) {
      descriptor.set.call(element, next);
    } else {
      element.value = next;
    }
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setContentEditableValue(element, value, append) {
    element.focus();
    if (append) {
      placeCaretAtEnd(element);
    } else {
      selectAllContent(element);
    }

    var inserted = false;
    try {
      inserted = document.execCommand("insertText", false, value);
    } catch (e) {
      inserted = false;
    }

    if (!inserted) {
      // 部分站点会拦截 execCommand，兜底直接改 DOM 再补发 input 事件
      if (append) {
        element.appendChild(document.createTextNode(value));
      } else {
        element.textContent = value;
      }
      placeCaretAtEnd(element);
    }
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: value,
      }),
    );
  }

  function setNativeValue(element, value, mode) {
    var isFormField =
      element.tagName === "TEXTAREA" || element.tagName === "INPUT";
    if (isFormField) {
      setFormFieldValue(element, value, mode === "append");
    } else {
      setContentEditableValue(element, value, mode === "append");
    }
  }

  function injectPromptToPage(text, shouldSubmit, options) {
    var inputEl = findInputElement();
    if (!inputEl) {
      return { success: false, error: "未找到输入框" };
    }
    var mode = options && options.mode === "append" ? "append" : "replace";
    setNativeValue(inputEl, text, mode);
    if (shouldSubmit) {
      setTimeout(function () {
        var sendButton = findSendButton();
        if (sendButton) {
          sendButton.click();
        } else {
          simulateEnter(inputEl);
        }
      }, 300);
    }
    return { success: true };
  }

  function findSendButton() {
    var customSite = getCustomSite();
    var customButton = customSite && querySelectorSafe(customSite.sendSelector);
    if (customButton) return customButton;
    var buttonSelectors = [
      'button[data-testid="send-button"]',
      'button[aria-label="Send"]',
      'button[aria-label="发送"]',
      'button[aria-label="Submit"]',
      'button[aria-label="提交"]',
      'button[title="Send"]',
      'button[title="发送"]',
      'button[aria-label*="send" i]',
      'button[aria-label*="发送" i]',
      'button[data-testid*="send" i]',
    ];
    for (var i = 0; i < buttonSelectors.length; i++) {
      var btn = document.querySelector(buttonSelectors[i]);
      if (btn && !btn.disabled) return btn;
    }
    var buttons = document.querySelectorAll("button");
    for (var k = 0; k < buttons.length; k++) {
      if (buttons[k].disabled) continue;
      var svg = buttons[k].querySelector("svg");
      if (svg) {
        var ariaLabel = (
          buttons[k].getAttribute("aria-label") || ""
        ).toLowerCase();
        var title = (buttons[k].getAttribute("title") || "").toLowerCase();
        if (
          ariaLabel.includes("send") ||
          ariaLabel.includes("发送") ||
          title.includes("send") ||
          title.includes("发送")
        ) {
          return buttons[k];
        }
      }
    }
    return null;
  }

  function simulateEnter(element) {
    var isTextarea =
      element.tagName === "TEXTAREA" || element.tagName === "INPUT";
    var opts = {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
    };
    if (!isTextarea) opts.composed = true;
    element.dispatchEvent(new KeyboardEvent("keydown", opts));
    element.dispatchEvent(new KeyboardEvent("keypress", opts));
    element.dispatchEvent(new KeyboardEvent("keyup", opts));
  }

  // 触发网页 AI 的发送动作：优先点发送按钮，找不到则对输入框模拟回车
  function submitCurrent() {
    var sendButton = findSendButton();
    if (sendButton) {
      sendButton.click();
      return true;
    }
    var inputEl = findInputElement();
    if (inputEl) {
      inputEl.focus();
      simulateEnter(inputEl);
      return true;
    }
    return false;
  }

  return {
    injectPromptToPage: injectPromptToPage,
    findInputElement: findInputElement,
    findSendButton: findSendButton,
    simulateEnter: simulateEnter,
    submitCurrent: submitCurrent,
    getCustomSite: getCustomSite,
  };
})();
