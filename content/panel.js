var PromptPanel = (function () {
  var panelStyleEl = null;
  var ballStyleEl = null;
  var currentPanelCat = "all";
  var currentPanelTemplatePrompt = null;
  var currentPanelTemplateMode = "replace";
  var ballEl = null;
  var panelEl = null;
  // 悬浮球的位置以 right/bottom 为准（不随窗口尺寸变化），球体坐标由它推导
  var ballPos = null;
  var ballResizeBound = false;
  // 直径定义在 content/panel-styles.js（CSS 与 JS 定位必须同源）
  var BALL_SIZE = PP_BALL_SIZE;
  var BALL_STORAGE_KEY = "ppBallPos";
  var PANEL_STORAGE_KEY = "ppPanelPos";
  var PANEL_SIZE_STORAGE_KEY = "ppPanelSize";
  var DRAG_THRESHOLD = 5;
  var PANEL_MIN_WIDTH = 200;
  var PANEL_MAX_WIDTH = 600;
  var PANEL_MIN_HEIGHT = 150;
  var RESIZE_EDGE_THRESHOLD = 5;
  var noticeTimer = null;

  // 页面内轻量提示（面板没打开时也要能给反馈）
  function showNotice(text) {
    var el = document.getElementById("pp-notice");
    if (!el) {
      // 独立于悬浮球/面板注入：面板未打开时提示仍要工作
      var noticeStyle = document.createElement("style");
      noticeStyle.textContent = PP_NOTICE_CSS;
      (document.head || document.documentElement).appendChild(noticeStyle);

      el = document.createElement("div");
      el.id = "pp-notice";
      // 这里只放样式表无法表达的运行时状态（淡入淡出）
      el.style.cssText = "transition:opacity .2s!important;opacity:1!important";
      (document.body || document.documentElement).appendChild(el);
    }
    el.textContent = text;
    el.style.opacity = "1";
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(function () {
      el.style.opacity = "0";
    }, 1800);
  }

  function escapeHtml(str) {
    return PromptUtils.escapeHtml(str);
  }

  function highlightVariables(text) {
    var escaped = escapeHtml(text);
    return escaped.replace(
      /\{\{([^}]+)\}\}/g,
      '<span class="pp-var-chip">{{$1}}</span>',
    );
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function loadPosition(key, defaults, cb) {
    try {
      chrome.storage.local.get(key, function (data) {
        cb(data[key] || defaults);
      });
    } catch (e) {
      cb(defaults);
    }
  }

  function savePosition(key, pos) {
    try {
      var obj = {};
      obj[key] = pos;
      chrome.storage.local.set(obj);
    } catch (e) {}
  }

  function applyPanelTheme(panel) {
    try {
      chrome.storage.local.get({ theme: "dark" }, function (data) {
        panel.setAttribute(
          "data-theme",
          data.theme === "light" ? "light" : "dark",
        );
      });
    } catch (e) {
      panel.setAttribute("data-theme", "dark");
    }
  }

  function refreshPanelIcons() {
    if (typeof lucide !== "undefined" && lucide.createIcons) {
      lucide.createIcons();
    }
  }

  function createBall() {
    if (document.getElementById("pp-floating-ball")) return;

    ballStyleEl = document.createElement("style");
    ballStyleEl.textContent = PP_BALL_CSS;
    (document.head || document.documentElement).appendChild(ballStyleEl);

    var ball = document.createElement("div");
    ball.id = "pp-floating-ball";
    ball.innerHTML =
      '<div class="pp-ball-icon"><i data-lucide="sparkles"></i></div>';
    (document.body || document.documentElement).appendChild(ball);
    ballEl = ball;
    refreshPanelIcons();
    applyBallPos(ball, { right: 20, bottom: 80 });

    loadPosition(BALL_STORAGE_KEY, { right: 20, bottom: 80 }, function (pos) {
      applyBallPos(ball, pos);
    });

    bindBallEvents(ball);
    bindBallResize();
  }

  // right/bottom 记的是「离视口右下角的距离」；窗口变小后必须重新夹取，
  // 否则球会停在视口外，用户再也点不到。夹取作用在最终的 left/top 上，
  // 再反推回 right/bottom，这样极端窄窗（比球还小）也不会算出负坐标。
  function applyBallPos(ball, pos) {
    if (!ball) return;
    var maxLeft = Math.max(0, window.innerWidth - BALL_SIZE);
    var maxTop = Math.max(0, window.innerHeight - BALL_SIZE);
    var left = clamp(window.innerWidth - pos.right - BALL_SIZE, 0, maxLeft);
    var top = clamp(window.innerHeight - pos.bottom - BALL_SIZE, 0, maxTop);
    ballPos = {
      right: window.innerWidth - left - BALL_SIZE,
      bottom: window.innerHeight - top - BALL_SIZE,
    };
    if (ball.classList.contains("pp-ball-dragging")) return;
    ball.style.left = left + "px";
    ball.style.top = top + "px";
  }

  function bindBallResize() {
    if (ballResizeBound) return;
    ballResizeBound = true;
    window.addEventListener("resize", function () {
      if (!ballEl || !ballPos) return;
      applyBallPos(ballEl, ballPos);
    });
  }

  function removeBall() {
    var ball = document.getElementById("pp-floating-ball");
    if (ball && ball.parentNode) ball.parentNode.removeChild(ball);
    if (ballStyleEl && ballStyleEl.parentNode) {
      ballStyleEl.parentNode.removeChild(ballStyleEl);
    }
    ballStyleEl = null;
    ballEl = null;
  }

  function setBallVisible(visible, persist) {
    if (visible) {
      createBall();
    } else {
      removeBall();
    }
    if (persist) {
      try {
        chrome.storage.local.set({ showBall: visible });
      } catch (e) {}
    }
  }

  function toggleBall() {
    var visible = !document.getElementById("pp-floating-ball");
    setBallVisible(visible, true);
    showNotice(visible ? "已显示悬浮球" : "已隐藏悬浮球");
  }

  function restoreBall() {
    try {
      chrome.storage.local.get({ showBall: true }, function (data) {
        if (data.showBall !== false) createBall();
      });
    } catch (e) {
      createBall();
    }
  }

  function bindBallEvents(ball) {
    var draggie = new Draggabilly(ball, {
      dragThreshold: DRAG_THRESHOLD,
    });
    var dragOrigin = null;

    draggie.on("dragStart", function () {
      var rect = ball.getBoundingClientRect();
      dragOrigin = { left: rect.left, top: rect.top };
      ball.classList.add("pp-ball-dragging");
    });

    draggie.on("dragMove", function (event, pointer, moveVector) {
      if (!dragOrigin) return;
      var maxLeft = Math.max(0, window.innerWidth - ball.offsetWidth);
      var maxTop = Math.max(0, window.innerHeight - ball.offsetHeight);
      var nextLeft = clamp(dragOrigin.left + moveVector.x, 0, maxLeft);
      var nextTop = clamp(dragOrigin.top + moveVector.y, 0, maxTop);
      draggie.position.x = nextLeft;
      draggie.position.y = nextTop;
      draggie.dragPoint.x = nextLeft - dragOrigin.left;
      draggie.dragPoint.y = nextTop - dragOrigin.top;
    });

    draggie.on("dragEnd", function () {
      dragOrigin = null;
      ball.classList.remove("pp-ball-dragging");
      var rect = ball.getBoundingClientRect();
      ball.style.transform = "";
      persistBallPos({
        right: Math.round(
          clamp(
            window.innerWidth - rect.right,
            0,
            window.innerWidth - BALL_SIZE,
          ),
        ),
        bottom: Math.round(
          clamp(
            window.innerHeight - rect.bottom,
            0,
            window.innerHeight - BALL_SIZE,
          ),
        ),
      });
      snapToEdge(ball, ball.getBoundingClientRect());
    });

    draggie.on("staticClick", function () {
      togglePanel();
    });
  }

  function snapToEdge(ball, rect) {
    var centerX = rect.left + rect.width / 2;
    var viewW = window.innerWidth;
    var targetLeft;
    if (centerX < viewW / 2) {
      targetLeft = 12;
    } else {
      targetLeft = viewW - rect.width - 12;
    }
    ball.style.transition = "left 0.25s ease";
    ball.style.left = targetLeft + "px";
    setTimeout(function () {
      ball.style.transition = "";
      var finalRect = ball.getBoundingClientRect();
      persistBallPos({
        right: Math.round(window.innerWidth - finalRect.right),
        bottom: Math.round(window.innerHeight - finalRect.bottom),
      });
    }, 260);
  }

  // 记忆并落盘：resize 时靠 ballPos 重新夹取，不再回读 storage
  function persistBallPos(pos) {
    if (!ballEl) return;
    applyBallPos(ballEl, pos);
    savePosition(BALL_STORAGE_KEY, ballPos);
  }

  function togglePanel() {
    if (panelEl && document.getElementById("prompt-injector-panel")) {
      closePanel();
    } else {
      createFloatingPanel();
    }
  }

  function createFloatingPanel() {
    var existing = document.getElementById("prompt-injector-panel");
    if (existing) {
      closePanel();
      return;
    }

    ensurePanelStyle();

    var panel = document.createElement("div");
    panel.id = "prompt-injector-panel";
    panel.innerHTML = PANEL_HTML;
    (document.body || document.documentElement).appendChild(panel);
    panelEl = panel;
    applyPanelTheme(panel);
    refreshPanelIcons();
    panel.style.width = "380px";
    panel.style.height = "420px";
    panel.style.left = "20px";
    panel.style.top = "80px";

    loadPosition(
      PANEL_SIZE_STORAGE_KEY,
      { width: 380, height: 420 },
      function (size) {
        var maxHeight = Math.max(PANEL_MIN_HEIGHT, window.innerHeight - 20);
        panel.style.width =
          clamp(size.width, PANEL_MIN_WIDTH, PANEL_MAX_WIDTH) + "px";
        panel.style.height =
          clamp(size.height, PANEL_MIN_HEIGHT, maxHeight) + "px";
        loadPosition(PANEL_STORAGE_KEY, { right: 20, top: 80 }, function (pos) {
          var maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth);
          var maxTop = Math.max(10, window.innerHeight - panel.offsetHeight);
          panel.style.left =
            clamp(
              window.innerWidth - pos.right - panel.offsetWidth,
              0,
              maxLeft,
            ) + "px";
          panel.style.top = clamp(pos.top, 10, maxTop) + "px";
        });
      },
    );

    bindPanelEvents(panel);
    bindPanelDrag(panel);
    bindPanelResize(panel);
    currentPanelCat = "all";
    renderPanelCategories();
    renderPanelList("");
    setTimeout(function () {
      var searchEl = document.getElementById("pi-search-input");
      if (searchEl) searchEl.focus();
    }, 100);
  }

  function ensurePanelStyle() {
    if (panelStyleEl) return;
    panelStyleEl = document.createElement("style");
    panelStyleEl.textContent = PP_PANEL_CSS;
    (document.head || document.documentElement).appendChild(panelStyleEl);
  }

  function bindPanelDrag(panel) {
    var header = panel.querySelector("#pi-header");
    if (!header) return;

    var draggie = new Draggabilly(panel, {
      handle: header,
      dragThreshold: DRAG_THRESHOLD,
    });

    panel.addEventListener(
      "pointerdown",
      function (e) {
        if (!e.target.closest("button")) return;
        draggie.disable();
        panel.addEventListener(
          "pointerup",
          function () {
            draggie.enable();
          },
          { once: true, capture: true },
        );
      },
      true,
    );

    draggie.on("dragStart", function () {
      panel.classList.add("pi-dragging");
    });

    draggie.on("dragEnd", function () {
      panel.classList.remove("pi-dragging");
      var rect = panel.getBoundingClientRect();
      panel.style.transform = "";
      savePosition(PANEL_STORAGE_KEY, {
        right: Math.round(
          clamp(window.innerWidth - rect.right, 0, window.innerWidth - 100),
        ),
        top: Math.round(clamp(rect.top, 0, window.innerHeight - 60)),
      });
    });
  }

  function bindPanelResize(panel) {
    var resizeState = null;

    function getResizeDirection(rect, clientX, clientY) {
      var nearLeft = clientX - rect.left <= RESIZE_EDGE_THRESHOLD;
      var nearRight = rect.right - clientX <= RESIZE_EDGE_THRESHOLD;
      var nearTop = clientY - rect.top <= RESIZE_EDGE_THRESHOLD;
      var nearBottom = rect.bottom - clientY <= RESIZE_EDGE_THRESHOLD;
      var horizontal = nearLeft ? "w" : nearRight ? "e" : "";
      var vertical = nearTop ? "n" : nearBottom ? "s" : "";
      return vertical + horizontal;
    }

    function getCursor(direction) {
      return (
        {
          n: "ns-resize",
          s: "ns-resize",
          e: "ew-resize",
          w: "ew-resize",
          ne: "nesw-resize",
          sw: "nesw-resize",
          nw: "nwse-resize",
          se: "nwse-resize",
        }[direction] || ""
      );
    }

    function saveResizeState() {
      var rect = panel.getBoundingClientRect();
      savePosition(PANEL_SIZE_STORAGE_KEY, {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
      savePosition(PANEL_STORAGE_KEY, {
        right: Math.round(window.innerWidth - rect.right),
        top: Math.round(rect.top),
      });
    }

    function onPointerMove(e) {
      if (!resizeState) {
        panel.style.cursor = getCursor(
          getResizeDirection(
            panel.getBoundingClientRect(),
            e.clientX,
            e.clientY,
          ),
        );
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      var dx = e.clientX - resizeState.startX;
      var dy = e.clientY - resizeState.startY;
      var maxWidth = Math.max(
        PANEL_MIN_WIDTH,
        Math.min(PANEL_MAX_WIDTH, window.innerWidth - 20),
      );
      var maxHeight = Math.max(PANEL_MIN_HEIGHT, window.innerHeight - 20);
      var direction = resizeState.direction;
      var width = resizeState.startWidth;
      var height = resizeState.startHeight;
      var left = resizeState.startLeft;
      var top = resizeState.startTop;

      if (direction.includes("e"))
        width = clamp(width + dx, PANEL_MIN_WIDTH, maxWidth);
      if (direction.includes("s"))
        height = clamp(height + dy, PANEL_MIN_HEIGHT, maxHeight);
      if (direction.includes("w")) {
        width = clamp(resizeState.startWidth - dx, PANEL_MIN_WIDTH, maxWidth);
        left = resizeState.startLeft + resizeState.startWidth - width;
      }
      if (direction.includes("n")) {
        height = clamp(
          resizeState.startHeight - dy,
          PANEL_MIN_HEIGHT,
          maxHeight,
        );
        top = resizeState.startTop + resizeState.startHeight - height;
      }

      panel.style.width = width + "px";
      panel.style.height = height + "px";
      panel.style.left = Math.max(0, left) + "px";
      panel.style.top = Math.max(0, top) + "px";
    }

    function stopResize(e) {
      if (!resizeState) return;
      e.preventDefault();
      e.stopPropagation();
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", stopResize, true);
      window.removeEventListener("pointercancel", stopResize, true);
      panel.classList.remove("pi-resizing");
      panel.style.cursor = "";
      saveResizeState();
      resizeState = null;
    }

    function startResize(e) {
      if (e.button !== 0) return;
      var rect = panel.getBoundingClientRect();
      var direction = getResizeDirection(rect, e.clientX, e.clientY);
      if (!direction) return;
      e.preventDefault();
      e.stopPropagation();
      resizeState = {
        direction: direction,
        startX: e.clientX,
        startY: e.clientY,
        startLeft: rect.left,
        startTop: rect.top,
        startWidth: rect.width,
        startHeight: rect.height,
      };
      panel.classList.add("pi-resizing");
      panel.style.cursor = getCursor(direction);
      window.addEventListener("pointermove", onPointerMove, true);
      window.addEventListener("pointerup", stopResize, true);
      window.addEventListener("pointercancel", stopResize, true);
    }

    panel.addEventListener("pointermove", onPointerMove, true);
    panel.addEventListener("pointerleave", function () {
      if (!resizeState) panel.style.cursor = "";
    });
    panel.addEventListener("pointerdown", startResize, true);
  }

  function bindPanelEvents(panel) {
    panel.querySelector("#pi-close").addEventListener(
      "click",
      function (e) {
        e.stopPropagation();
        closePanel();
      },
      true,
    );

    panel.querySelector("#pi-search-input").addEventListener(
      "input",
      function (e) {
        e.stopPropagation();
        renderPanelList(e.target.value);
      },
      true,
    );

    panel.querySelector("#pi-cats").addEventListener(
      "click",
      function (e) {
        e.stopPropagation();
        var tab = e.target.closest(".pi-cat");
        if (!tab) return;
        currentPanelCat = tab.dataset.cat;
        panel.querySelectorAll("#pi-cats .pi-cat").forEach(function (t) {
          t.classList.remove("active");
        });
        tab.classList.add("active");
        renderPanelList(panel.querySelector("#pi-search-input").value);
      },
      true,
    );

    panel.querySelector("#pi-tpl-back").addEventListener(
      "click",
      function (e) {
        e.stopPropagation();
        closePanelTemplate();
      },
      true,
    );

    panel.querySelector("#pi-tpl-cancel").addEventListener(
      "click",
      function (e) {
        e.stopPropagation();
        closePanelTemplate();
      },
      true,
    );

    panel.querySelector("#pi-tpl-inject").addEventListener(
      "click",
      function (e) {
        e.stopPropagation();
        injectPanelTemplate();
      },
      true,
    );

    panel.addEventListener(
      "mousedown",
      function (e) {
        e.stopPropagation();
      },
      false,
    );

    panel.addEventListener(
      "click",
      function (e) {
        e.stopPropagation();
      },
      false,
    );
  }

  function renderPanelCategories() {
    chrome.storage.local.get({ categories: [] }, function (data) {
      var categories = data.categories || [];
      categories.sort(function (a, b) {
        return (a.order || 0) - (b.order || 0);
      });
      var html =
        '<button class="pi-cat ' +
        (currentPanelCat === "all" ? "active" : "") +
        '" data-cat="all">全部</button>';
      categories.forEach(function (cat) {
        html +=
          '<button class="pi-cat ' +
          (currentPanelCat === cat.id ? "active" : "") +
          '" data-cat="' +
          cat.id +
          '">' +
          escapeHtml(cat.icon || "") +
          " " +
          escapeHtml(cat.name) +
          "</button>";
      });
      var catsEl = document.getElementById("pi-cats");
      if (catsEl) {
        catsEl.innerHTML = html;
        refreshPanelIcons();
      }
    });
  }

  function renderPanelList(filter) {
    var listEl = document.getElementById("pi-list");
    if (!listEl) return;

    chrome.storage.local.get(
      { prompts: [], categories: [], sortBy: "updatedAt", sortOrder: "desc" },
      function (data) {
        var prompts = data.prompts || [];
        var sortBy = data.sortBy || "updatedAt";
        var sortOrder = data.sortOrder || "desc";

        var filtered = prompts;
        if (currentPanelCat !== "all") {
          filtered = filtered.filter(function (p) {
            return p.categoryId === currentPanelCat;
          });
        }
        if (filter) {
          var lf = filter.toLowerCase();
          filtered = filtered.filter(function (p) {
            return (
              p.title.toLowerCase().includes(lf) ||
              p.content.toLowerCase().includes(lf) ||
              (p.tags || []).some(function (t) {
                return t.toLowerCase().includes(lf);
              })
            );
          });
        }

        filtered.sort(function (a, b) {
          var ap = a.pinned ? 1 : 0;
          var bp = b.pinned ? 1 : 0;
          if (ap !== bp) return bp - ap;
          var av, bv;
          if (sortBy === "title") {
            av = (a.title || "").toLowerCase();
            bv = (b.title || "").toLowerCase();
            if (av < bv) return sortOrder === "asc" ? -1 : 1;
            if (av > bv) return sortOrder === "asc" ? 1 : -1;
            return 0;
          } else if (sortBy === "usageCount") {
            av = a.usageCount || 0;
            bv = b.usageCount || 0;
          } else {
            av = a.updatedAt || 0;
            bv = b.updatedAt || 0;
          }
          return sortOrder === "asc" ? av - bv : bv - av;
        });

        if (filtered.length === 0) {
          listEl.innerHTML = '<div class="pi-empty">暂无提示词</div>';
          return;
        }

        listEl.innerHTML = filtered
          .map(function (p, i) {
            var hasVars = PromptUtils.hasVariables(p.content);
            return (
              '<div class="pi-item" data-index="' +
              i +
              '">' +
              '<div class="pi-item-header">' +
              '<span class="pi-item-title">' +
              escapeHtml(p.title) +
              "</span>" +
              (p.pinned ? '<i class="pi-pin" data-lucide="pin"></i>' : "") +
              (hasVars ? '<span class="pi-tpl-badge">模板</span>' : "") +
              (p.usageCount > 0
                ? '<span class="pi-usage">' + p.usageCount + "次</span>"
                : "") +
              "</div>" +
              '<div class="pi-item-preview">' +
              highlightVariables(p.content) +
              "</div>" +
              (p.tags && p.tags.length
                ? '<div class="pi-item-tags">' +
                  p.tags
                    .map(function (t) {
                      return (
                        '<span class="pi-tag">' + escapeHtml(t) + "</span>"
                      );
                    })
                    .join("") +
                  "</div>"
                : "") +
              "</div>"
            );
          })
          .join("");
        refreshPanelIcons();

        listEl.querySelectorAll(".pi-item").forEach(function (item) {
          item.addEventListener(
            "click",
            function (e) {
              e.stopPropagation();
              var idx = parseInt(item.dataset.index);
              var prompt = filtered[idx];
              if (!prompt) return;
              // Alt + 点击 = 追加到输入框已有内容之后（多轮对话补一段）
              var mode = e.altKey ? "append" : "replace";

              if (PromptUtils.hasVariables(prompt.content)) {
                openPanelTemplate(prompt, mode);
              } else {
                injectFromPanel({
                  text: prompt.content,
                  promptId: prompt.id,
                  title: prompt.title,
                  mode: mode,
                });
              }
            },
            true,
          );
        });
      },
    );
  }

  function openPanelTemplate(prompt, mode) {
    currentPanelTemplatePrompt = prompt;
    currentPanelTemplateMode = mode || "replace";
    var variables = PromptUtils.extractVariables(prompt.content);
    var fieldsEl = document.getElementById("pi-tpl-fields");
    if (!fieldsEl) return;

    fieldsEl.innerHTML = variables
      .map(function (v) {
        return (
          '<div class="pi-tpl-field">' +
          "<label>" +
          escapeHtml(v.name) +
          "</label>" +
          '<input type="text" data-var-name="' +
          escapeHtml(v.name) +
          '" value="' +
          escapeHtml(v.defaultValue) +
          '" placeholder="' +
          escapeHtml(v.defaultValue || v.name) +
          '" />' +
          "</div>"
        );
      })
      .join("");

    fieldsEl.querySelectorAll("input").forEach(function (input) {
      input.addEventListener(
        "input",
        function (e) {
          e.stopPropagation();
          updatePanelTemplatePreview();
        },
        true,
      );
    });

    updatePanelTemplatePreview();
    document.getElementById("pi-template-dialog").classList.remove("hidden");
    if (fieldsEl.querySelector("input"))
      fieldsEl.querySelector("input").focus();
  }

  function updatePanelTemplatePreview() {
    if (!currentPanelTemplatePrompt) return;
    var values = {};
    var fieldsEl = document.getElementById("pi-tpl-fields");
    if (!fieldsEl) return;
    fieldsEl.querySelectorAll("input").forEach(function (input) {
      values[input.dataset.varName] = input.value;
    });
    var filled = PromptUtils.fillTemplate(
      currentPanelTemplatePrompt.content,
      values,
    );
    var previewEl = document.getElementById("pi-tpl-preview-content");
    if (previewEl) previewEl.innerHTML = highlightVariables(filled);
  }

  function closePanelTemplate() {
    var dialog = document.getElementById("pi-template-dialog");
    if (dialog) dialog.classList.add("hidden");
    currentPanelTemplatePrompt = null;
    currentPanelTemplateMode = "replace";
  }

  function injectPanelTemplate() {
    if (!currentPanelTemplatePrompt) return;
    var values = {};
    var fieldsEl = document.getElementById("pi-tpl-fields");
    if (!fieldsEl) return;
    fieldsEl.querySelectorAll("input").forEach(function (input) {
      values[input.dataset.varName] = input.value;
    });
    var filled = PromptUtils.fillTemplate(
      currentPanelTemplatePrompt.content,
      values,
    );
    injectFromPanel({
      text: filled,
      promptId: currentPanelTemplatePrompt.id,
      title: currentPanelTemplatePrompt.title,
      mode: currentPanelTemplateMode,
    });
  }

  function closePanel() {
    var p = document.getElementById("prompt-injector-panel");
    if (p) {
      var rect = p.getBoundingClientRect();
      savePosition(PANEL_STORAGE_KEY, {
        right: Math.round(window.innerWidth - rect.right),
        top: Math.round(rect.top),
      });
      p.remove();
    }
    panelEl = null;
  }

  // 统一的面板注入入口：失败时先就地重定位输入框再重试，仍是失败才收尾提示
  function injectFromPanel(params, alreadyRelocated) {
    var result = null;
    try {
      result = PromptInjector.injectPromptToPage(params.text, false, {
        mode: params.mode,
      });
    } catch (e) {
      result = null;
    }
    if (result && result.success) {
      if (params.promptId) incrementPanelUsage(params.promptId);
      showNotice(
        (params.mode === "append" ? "已追加「" : "已注入「") +
          (params.title || "内容") +
          "」",
      );
      closePanel();
      return;
    }
    if (!alreadyRelocated && relocateAndRetry(params)) {
      showNotice("正在识别输入框…");
      return;
    }
    showNotice("注入失败：" + ((result && result.error) || "未找到输入框"));
  }

  // 优先更新真正命中当前网址的站点，避免生成一条几乎重复的新规则
  function relocateAndRetry(params) {
    if (typeof PromptDetector === "undefined" || !PromptDetector.detect)
      return false;
    var info = null;
    try {
      info = PromptDetector.detect();
    } catch (e) {
      info = null;
    }
    if (!info || !info.inputSelector) return false;

    try {
      chrome.storage.local.get({ customSites: [] }, function (data) {
        var sites = data.customSites || [];
        var matched = PromptUtils.matchSiteForUrl(sites, window.location.href);
        var pattern = matched
          ? matched.pattern
          : PromptUtils.deriveSitePattern(window.location.href);
        if (!pattern) return;
        saveDetectedSite(pattern, matched, info, function () {
          // 站点配置靠 storage 事件回流到 inject 的缓存里，稍等一拍再重试
          setTimeout(function () {
            injectFromPanel(params, true);
          }, 80);
        });
      });
    } catch (e) {
      return false;
    }
    return true;
  }

  function saveDetectedSite(pattern, existing, info, done) {
    try {
      chrome.storage.local.get({ customSites: [] }, function (data) {
        var sites = data.customSites || [];
        var index = existing
          ? sites.findIndex(function (s) {
              return s.id === existing.id;
            })
          : -1;
        var site =
          index !== -1
            ? Object.assign({}, sites[index])
            : {
                id: PromptUtils.generateId("site"),
                enabled: true,
                name: "",
                inputSelector: "",
                sendSelector: "",
              };
        site.pattern = pattern;
        if (!site.name) {
          site.name = (info && info.name) || PromptUtils.deriveSiteName(pattern);
        }
        site.inputSelector = info.inputSelector;
        site.sendSelector = (info && info.sendSelector) || "";
        site.detectedAt = Date.now();

        var next = sites.slice();
        if (index !== -1) next[index] = site;
        else next.push(site);
        chrome.storage.local.set({ customSites: next }, function () {
          if (done) done();
        });
      });
    } catch (e) {
      if (done) done();
    }
  }

  function incrementPanelUsage(id) {
    chrome.storage.local.get({ prompts: [] }, function (data) {
      var prompts = data.prompts || [];
      var idx = prompts.findIndex(function (p) {
        return p.id === id;
      });
      if (idx !== -1) {
        prompts[idx].usageCount = (prompts[idx].usageCount || 0) + 1;
        prompts[idx].updatedAt = Date.now();
        chrome.storage.local.set({ prompts: prompts });
      }
    });
  }

  // 跳过面板直接注入最近一条使用过的提示词
  function injectRecent() {
    try {
      chrome.storage.local.get({ prompts: [] }, function (data) {
        var used = (data.prompts || [])
          .filter(function (p) {
            return (p.usageCount || 0) > 0;
          })
          .sort(function (a, b) {
            return (b.updatedAt || 0) - (a.updatedAt || 0);
          });
        if (!used.length) {
          showNotice("还没有使用过的提示词");
          return;
        }
        var prompt = used[0];
        if (PromptUtils.hasVariables(prompt.content)) {
          if (!document.getElementById("prompt-injector-panel")) {
            createFloatingPanel();
          }
          openPanelTemplate(prompt);
          return;
        }
        injectFromPanel({
          text: prompt.content,
          promptId: prompt.id,
          title: prompt.title,
          mode: "replace",
        });
      });
    } catch (e) {
      showNotice("注入失败");
    }
  }

  function submitCurrent() {
    var done = false;
    try {
      done = PromptInjector.submitCurrent();
    } catch (e) {
      done = false;
    }
    showNotice(done ? "已发送" : "未找到发送按钮");
    return done;
  }

  function init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", restoreBall);
    } else {
      restoreBall();
    }

    chrome.runtime.onMessage.addListener(
      function (message, sender, sendResponse) {
        if (message.type === "inject_prompt") {
          var result = PromptInjector.injectPromptToPage(
            message.text,
            message.shouldSubmit || false,
            { mode: message.mode },
          );
          sendResponse(result);
        } else if (message.type === "toggle_panel") {
          togglePanel();
          sendResponse({ success: true });
        }
        return true;
      },
    );

    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(function (changes, areaName) {
        if (areaName === "local" && changes.theme && panelEl) {
          panelEl.setAttribute(
            "data-theme",
            changes.theme.newValue === "light" ? "light" : "dark",
          );
        }
      });
    }
  }

  var PANEL_HTML = [
    '<div id="pi-header">',
    "<span>PromptPilot</span>",
    '<button id="pi-close" title="关闭"><i data-lucide="x"></i></button>',
    "</div>",
    '<div id="pi-cats"></div>',
    '<div id="pi-search">',
    '<input type="text" id="pi-search-input" placeholder="搜索提示词..." />',
    "</div>",
    '<div id="pi-list"></div>',
    '<div id="pi-template-dialog" class="hidden">',
    '<div id="pi-tpl-header">',
    '<button id="pi-tpl-back"><i data-lucide="arrow-left"></i> 返回</button>',
    "<span>填写模板变量</span>",
    '<div style="width:40px"></div>',
    "</div>",
    '<div id="pi-tpl-fields"></div>',
    '<div id="pi-tpl-preview">',
    "<label>预览</label>",
    '<div id="pi-tpl-preview-content"></div>',
    "</div>",
    '<div id="pi-tpl-actions">',
    '<button id="pi-tpl-cancel" class="pi-btn pi-btn-secondary">取消</button>',
    '<button id="pi-tpl-inject" class="pi-btn pi-btn-primary">注入</button>',
    "</div>",
    "</div>",
  ].join("\n");

  return {
    init: init,
    createFloatingPanel: createFloatingPanel,
    togglePanel: togglePanel,
    closePanel: closePanel,
    toggleBall: toggleBall,
    setBallVisible: setBallVisible,
    injectRecent: injectRecent,
    submitCurrent: submitCurrent,
    showNotice: showNotice,
    isPanelOpen: function () {
      return !!document.getElementById("prompt-injector-panel");
    },
  };
})();

PromptPanel.init();
