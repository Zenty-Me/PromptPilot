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

  function getCustomSite() {
    var href = window.location.href;
    return customSites.find(function (site) {
      if (!site.enabled) return false;
      var pattern = String(site.pattern || "").trim();
      if (!pattern) return false;
      var regex = new RegExp(
        "^" +
          pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") +
          "$",
        "i",
      );
      return regex.test(href) || regex.test(window.location.hostname);
    });
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

  function setNativeValue(element, value) {
    var isTextarea =
      element.tagName === "TEXTAREA" || element.tagName === "INPUT";
    if (isTextarea) {
      var nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype ||
          window.HTMLInputElement.prototype,
        "value",
      );
      if (nativeInputValueSetter && nativeInputValueSetter.set) {
        nativeInputValueSetter.set.call(element, value);
      } else {
        element.value = value;
      }
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      element.focus();
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function injectPromptToPage(text, shouldSubmit) {
    var inputEl = findInputElement();
    if (!inputEl) {
      return { success: false, error: "未找到输入框" };
    }
    setNativeValue(inputEl, text);
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
    ];
    for (var i = 0; i < buttonSelectors.length; i++) {
      var btn = document.querySelector(buttonSelectors[i]);
      if (btn) return btn;
    }
    var buttons = document.querySelectorAll("button");
    for (var k = 0; k < buttons.length; k++) {
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
    var opts = { key: "Enter", code: "Enter", keyCode: 13, bubbles: true };
    if (!isTextarea) opts.composed = true;
    element.dispatchEvent(new KeyboardEvent("keydown", opts));
    element.dispatchEvent(new KeyboardEvent("keypress", opts));
    element.dispatchEvent(new KeyboardEvent("keyup", opts));
  }

  return {
    injectPromptToPage: injectPromptToPage,
    findInputElement: findInputElement,
  };
})();
