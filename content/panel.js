var PromptPanel = (function () {
  var panelStyleEl = null;
  var ballStyleEl = null;
  var currentPanelCat = "all";
  var currentPanelTemplatePrompt = null;
  var ballEl = null;
  var panelEl = null;
  var BALL_SIZE = 44;
  var BALL_STORAGE_KEY = "ppBallPos";
  var PANEL_STORAGE_KEY = "ppPanelPos";
  var PANEL_SIZE_STORAGE_KEY = "ppPanelSize";
  var DRAG_THRESHOLD = 5;
  var PANEL_MIN_WIDTH = 200;
  var PANEL_MAX_WIDTH = 600;
  var PANEL_MIN_HEIGHT = 150;
  var RESIZE_EDGE_THRESHOLD = 5;

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
    ballStyleEl.textContent = BALL_CSS;
    (document.head || document.documentElement).appendChild(ballStyleEl);

    var ball = document.createElement("div");
    ball.id = "pp-floating-ball";
    ball.innerHTML =
      '<div class="pp-ball-icon"><i data-lucide="sparkles"></i></div>';
    (document.body || document.documentElement).appendChild(ball);
    ballEl = ball;
    refreshPanelIcons();
    ball.style.left = Math.max(0, window.innerWidth - BALL_SIZE - 20) + "px";
    ball.style.top = Math.max(0, window.innerHeight - BALL_SIZE - 80) + "px";

    loadPosition(BALL_STORAGE_KEY, { right: 20, bottom: 80 }, function (pos) {
      var r = clamp(pos.right, 0, window.innerWidth - BALL_SIZE);
      var b = clamp(pos.bottom, 0, window.innerHeight - BALL_SIZE);
      ball.style.left = window.innerWidth - r - BALL_SIZE + "px";
      ball.style.top = window.innerHeight - b - BALL_SIZE + "px";
    });

    bindBallEvents(ball);
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
      savePosition(BALL_STORAGE_KEY, {
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
      savePosition(BALL_STORAGE_KEY, {
        right: Math.round(window.innerWidth - finalRect.right),
        bottom: Math.round(window.innerHeight - finalRect.bottom),
      });
    }, 260);
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
    panelStyleEl.textContent = PANEL_CSS;
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

              if (PromptUtils.hasVariables(prompt.content)) {
                openPanelTemplate(prompt);
              } else {
                var result = PromptInjector.injectPromptToPage(
                  prompt.content,
                  false,
                );
                if (result.success) {
                  incrementPanelUsage(prompt.id);
                  closePanel();
                }
              }
            },
            true,
          );
        });
      },
    );
  }

  function openPanelTemplate(prompt) {
    currentPanelTemplatePrompt = prompt;
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
    var result = PromptInjector.injectPromptToPage(filled, false);
    if (result.success) {
      incrementPanelUsage(currentPanelTemplatePrompt.id);
      closePanel();
    }
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

  function init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", createBall);
    } else {
      createBall();
    }

    chrome.runtime.onMessage.addListener(
      function (message, sender, sendResponse) {
        if (message.type === "inject_prompt") {
          var result = PromptInjector.injectPromptToPage(
            message.text,
            message.shouldSubmit || false,
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

  var BALL_CSS = [
    "#pp-floating-ball{position:fixed!important;z-index:2147483646!important;width:" +
      BALL_SIZE +
      "px!important;height:" +
      BALL_SIZE +
      "px!important;border-radius:50%!important;background:linear-gradient(135deg,#89b4fa,#74c7ec)!important;box-shadow:0 2px 12px rgba(137,180,250,0.4)!important;cursor:pointer!important;display:flex!important;align-items:center!important;justify-content:center!important;user-select:none!important;touch-action:none!important;transition:box-shadow 0.2s,transform 0.2s!important;margin:0!important;padding:0!important;border:none!important;outline:none!important;opacity:1!important;visibility:visible!important;pointer-events:auto!important}",
    "#pp-floating-ball:hover{box-shadow:0 4px 20px rgba(137,180,250,0.6),0 0 0 6px rgba(137,180,250,0.15)!important}",
    "#pp-floating-ball:active{box-shadow:0 2px 10px rgba(137,180,250,0.5)!important}",
    "#pp-floating-ball.pp-ball-dragging{opacity:0.85!important;box-shadow:0 6px 24px rgba(137,180,250,0.5)!important}",
    ".pp-ball-icon{font-size:18px!important;color:#1e1e2e!important;font-weight:700!important;line-height:1!important;pointer-events:none!important;margin:0!important;padding:0!important}",
    "@keyframes pp-ball-pulse{0%{box-shadow:0 2px 12px rgba(137,180,250,0.4),0 0 0 0 rgba(137,180,250,0.3)}70%{box-shadow:0 2px 12px rgba(137,180,250,0.4),0 0 0 10px rgba(137,180,250,0)}100%{box-shadow:0 2px 12px rgba(137,180,250,0.4),0 0 0 0 rgba(137,180,250,0)}}",
    "#pp-floating-ball{animation:pp-ball-pulse 2.5s ease-out infinite}",
    "#pp-floating-ball:hover{animation:none!important}",
    "#pp-floating-ball.pp-ball-dragging{animation:none!important}",
  ].join("\n");

  var PANEL_CSS = [
    '#prompt-injector-panel{position:fixed!important;width:380px;max-width:calc(100vw - 20px);height:420px;max-height:calc(100vh - 20px);min-height:150px;min-width:200px;background:#171a1f!important;border:1px solid #35434a!important;border-top:2px solid #7ce7d8!important;border-radius:10px!important;box-shadow:0 12px 34px rgba(0,0,0,0.42)!important;z-index:2147483647!important;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif!important;color:#e6eee9!important;display:flex!important;flex-direction:column!important;overflow:hidden!important;resize:none!important}',
    "#prompt-injector-panel.pi-resizing{user-select:none!important;transition:none!important}",
    "#prompt-injector-panel *{box-sizing:border-box!important}",
    "#prompt-injector-panel.pi-dragging{opacity:0.92!important;cursor:move!important}",
    "#pi-header{display:flex!important;justify-content:space-between!important;align-items:center!important;padding:10px 14px!important;background:#20272b!important;border-bottom:1px solid #35434a!important;cursor:move!important;user-select:none!important}",
    "#pi-header span{font-weight:600!important;font-size:14px!important;pointer-events:none!important;color:#cdd6f4!important}",
    "#pi-close{background:none!important;border:none!important;color:#cdd6f4!important;font-size:20px!important;cursor:pointer!important;padding:0 4px!important;line-height:1!important;transition:color .15s!important}",
    "#pi-close:hover{color:#f38ba8!important}",
    "#pi-cats{display:flex!important;gap:4px!important;padding:6px 10px!important;border-bottom:1px solid #313244!important;overflow-x:auto!important;scrollbar-width:none!important}",
    "#pi-cats::-webkit-scrollbar{display:none!important}",
    ".pi-cat{padding:3px 8px!important;border-radius:5px!important;border:1px solid transparent!important;background:none!important;color:#a6adc8!important;font-size:11px!important;cursor:pointer!important;white-space:nowrap!important;transition:all .15s!important}",
    ".pi-cat:hover{background:#313244!important;color:#cdd6f4!important}",
    ".pi-cat.active{background:#45475a!important;color:#cdd6f4!important;border-color:#89b4fa!important}",
    "#pi-search{padding:6px 10px!important;border-bottom:1px solid #313244!important}",
    "#pi-search-input{width:100%!important;padding:7px 10px!important;background:#181825!important;border:1px solid #45475a!important;border-radius:6px!important;color:#cdd6f4!important;font-size:12px!important;outline:none!important;box-sizing:border-box!important}",
    "#pi-search-input:focus{border-color:#89b4fa!important}",
    "#pi-list{overflow-y:auto!important;flex:1!important;padding:2px 0!important;min-height:0!important}",
    ".pi-item{padding:8px 14px!important;cursor:pointer!important;border-bottom:1px solid #313244!important;transition:background .15s!important}",
    ".pi-item:hover{background:#313244!important}",
    ".pi-item:last-child{border-bottom:none!important}",
    ".pi-item-header{display:flex!important;align-items:center!important;gap:5px!important;margin-bottom:2px!important}",
    ".pi-item-title{font-weight:600!important;font-size:12px!important;color:#cdd6f4!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}",
    ".pi-pin{font-size:9px!important;color:#f9e2af!important;flex-shrink:0!important}",
    ".pi-tpl-badge{font-size:9px!important;padding:0 4px!important;border-radius:3px!important;background:#45475a!important;color:#89b4fa!important;flex-shrink:0!important}",
    ".pi-usage{font-size:9px!important;color:#585b70!important;margin-left:auto!important;flex-shrink:0!important}",
    ".pi-item-preview{font-size:11px!important;color:#a6adc8!important;font-family:'Cascadia Code','Fira Code',ui-monospace,Consolas,monospace!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}",
    ".pp-var-chip{display:inline-block!important;font-family:'Cascadia Code','Fira Code',ui-monospace,Consolas,monospace!important;font-size:10px!important;line-height:1.4!important;padding:0 4px!important;margin:0 1px!important;border-radius:4px!important;background:rgba(137,180,250,0.16)!important;color:#89b4fa!important;border:1px solid rgba(137,180,250,0.4)!important;vertical-align:baseline!important}",
    ".pi-item-tags{margin-top:3px!important;display:flex!important;gap:3px!important;flex-wrap:wrap!important}",
    ".pi-tag{font-size:9px!important;padding:1px 5px!important;border-radius:3px!important;background:#45475a!important;color:#bac2de!important}",
    ".pi-empty{padding:20px!important;text-align:center!important;color:#6c7086!important;font-size:12px!important}",
    "#pi-list::-webkit-scrollbar{width:5px!important}",
    "#pi-list::-webkit-scrollbar-track{background:transparent!important}",
    "#pi-list::-webkit-scrollbar-thumb{background:#45475a!important;border-radius:3px!important}",
    "#pi-template-dialog{position:absolute!important;top:0!important;left:0!important;right:0!important;bottom:0!important;background:#1e1e2e!important;display:flex!important;flex-direction:column!important;z-index:10!important}",
    "#pi-template-dialog.hidden{display:none!important}",
    "#pi-tpl-header{display:flex!important;justify-content:space-between!important;align-items:center!important;padding:10px 14px!important;background:#313244!important;border-bottom:1px solid #45475a!important}",
    "#pi-tpl-header span{font-weight:600!important;font-size:13px!important;color:#cdd6f4!important}",
    "#pi-tpl-back{background:none!important;border:none!important;color:#89b4fa!important;font-size:12px!important;cursor:pointer!important}",
    "#pi-tpl-back:hover{color:#74c7ec!important}",
    "#pi-tpl-fields{padding:10px 14px!important;display:flex!important;flex-direction:column!important;gap:8px!important;overflow-y:auto!important;flex:1!important}",
    ".pi-tpl-field{display:flex!important;flex-direction:column!important;gap:3px!important}",
    ".pi-tpl-field label{font-size:11px!important;font-weight:600!important;color:#a6adc8!important}",
    ".pi-tpl-field input{width:100%!important;padding:6px 10px!important;background:#181825!important;border:1px solid #45475a!important;border-radius:6px!important;color:#cdd6f4!important;font-size:12px!important;outline:none!important}",
    ".pi-tpl-field input:focus{border-color:#89b4fa!important}",
    "#pi-tpl-preview{padding:8px 14px!important;border-top:1px solid #313244!important}",
    "#pi-tpl-preview label{font-size:10px!important;font-weight:600!important;color:#a6adc8!important;display:block!important;margin-bottom:3px!important}",
    "#pi-tpl-preview-content{font-size:11px!important;color:#cdd6f4!important;background:#181825!important;border:1px solid #313244!important;border-radius:6px!important;padding:6px 8px!important;max-height:80px!important;overflow-y:auto!important;white-space:pre-wrap!important;word-break:break-all!important;line-height:1.4!important}",
    "#pi-tpl-actions{padding:8px 14px!important;display:flex!important;justify-content:flex-end!important;gap:6px!important;border-top:1px solid #313244!important}",
    ".pi-btn{padding:5px 12px!important;border-radius:6px!important;font-size:11px!important;font-weight:500!important;cursor:pointer!important;border:none!important;transition:all .15s!important}",
    ".pi-btn-primary{background:#89b4fa!important;color:#1e1e2e!important}",
    ".pi-btn-primary:hover{background:#74c7ec!important}",
    ".pi-btn-secondary{background:#313244!important;color:#cdd6f4!important}",
    ".pi-btn-secondary:hover{background:#45475a!important}",
    "#pi-resize-handle{position:absolute!important;left:0!important;bottom:0!important;width:16px!important;height:16px!important;cursor:nwse-resize!important;z-index:5!important;opacity:0.4!important;transition:opacity .15s!important}",
    "#pi-resize-handle:hover{opacity:0.8!important}",
    "#pi-resize-handle::before{content:''!important;position:absolute!important;left:3px!important;bottom:3px!important;width:8px!important;height:8px!important;border-left:2px solid #6c7086!important;border-bottom:2px solid #6c7086!important}",
    "#prompt-injector-panel{--pi-bg:#1e1e2e;--pi-surface:#313244;--pi-overlay:#181825;--pi-border:#45475a;--pi-text:#cdd6f4;--pi-sub:#a6adc8;--pi-dim:#6c7086;--pi-accent:#89b4fa;--pi-accent-hover:#74c7ec;--pi-tag:#45475a;--pi-tag-text:#bac2de;--pi-danger:#f38ba8}",
    '#prompt-injector-panel[data-theme="light"]{--pi-bg:#eff1f5;--pi-surface:#ccd0da;--pi-overlay:#e6e9ef;--pi-border:#bcc0cc;--pi-text:#4c4f69;--pi-sub:#5c5f77;--pi-dim:#7c7f93;--pi-accent:#1e66f5;--pi-accent-hover:#2a6ef5;--pi-tag:#bcc0cc;--pi-tag-text:#5c5f77;--pi-danger:#d20f39}',
    "#prompt-injector-panel{background:var(--pi-bg)!important;color:var(--pi-text)!important;border-color:var(--pi-border)!important;border-top-color:var(--pi-accent)!important}",
    "#prompt-injector-panel #pi-header,#prompt-injector-panel #pi-tpl-header{background:var(--pi-surface)!important;border-color:var(--pi-border)!important}",
    "#prompt-injector-panel #pi-header span,#prompt-injector-panel #pi-tpl-header span,#prompt-injector-panel #pi-close{color:var(--pi-text)!important}",
    "#prompt-injector-panel #pi-cats,#prompt-injector-panel #pi-search,#prompt-injector-panel #pi-tpl-preview,#prompt-injector-panel #pi-tpl-actions{border-color:var(--pi-surface)!important}",
    "#prompt-injector-panel .pi-cat{color:var(--pi-sub)!important}",
    "#prompt-injector-panel .pi-cat:hover,#prompt-injector-panel .pi-item:hover,#prompt-injector-panel .pi-btn-secondary:hover{background:var(--pi-surface)!important;color:var(--pi-text)!important}",
    "#prompt-injector-panel .pi-cat.active{background:var(--pi-surface)!important;color:var(--pi-text)!important;border-color:var(--pi-accent)!important}",
    "#prompt-injector-panel #pi-search-input,#prompt-injector-panel .pi-tpl-field input,#prompt-injector-panel #pi-tpl-preview-content{background:var(--pi-overlay)!important;border-color:var(--pi-border)!important;color:var(--pi-text)!important}",
    "#prompt-injector-panel #pi-search-input:focus,#prompt-injector-panel .pi-tpl-field input:focus{border-color:var(--pi-accent)!important}",
    "#prompt-injector-panel .pi-item{border-color:var(--pi-surface)!important}",
    "#prompt-injector-panel .pi-item-title,#prompt-injector-panel .pi-tpl-field label,#prompt-injector-panel #pi-tpl-preview label{color:var(--pi-text)!important}",
    "#prompt-injector-panel .pi-item-preview,#prompt-injector-panel .pi-tpl-field input,#prompt-injector-panel .pi-empty{color:var(--pi-sub)!important}",
    "#prompt-injector-panel .pi-tag,#prompt-injector-panel .pi-tpl-badge{background:var(--pi-tag)!important;color:var(--pi-tag-text)!important}",
    "#prompt-injector-panel .pp-var-chip{background:color-mix(in srgb,var(--pi-accent) 16%,transparent)!important;color:var(--pi-accent)!important;border-color:color-mix(in srgb,var(--pi-accent) 40%,transparent)!important}",
    "#prompt-injector-panel .pi-btn-primary{background:var(--pi-accent)!important;color:var(--pi-bg)!important}",
    "#prompt-injector-panel .pi-btn-primary:hover{background:var(--pi-accent-hover)!important}",
    "#prompt-injector-panel .pi-btn-secondary{background:var(--pi-surface)!important;color:var(--pi-text)!important}",
    "#prompt-injector-panel svg[data-lucide]{width:14px!important;height:14px!important;stroke-width:1.8!important;vertical-align:middle!important}",
  ].join("\n");

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
  };
})();

PromptPanel.init();
