var App = (function () {
  var editingId = null;
  var currentCategory = "all";
  var viewMode = "list";
  var batchMode = false;
  var selectedIds = new Set();
  var selectedIdx = -1;
  var promptListSortable = null;
  var confirmCallback = null;
  var contextTargetId = null;
  var editingSiteId = null;
  var shortcutBindings = {};
  var recordingShortcutId = null;

  var notyf = new Notyf({
    duration: 2500,
    position: { x: "right", y: "bottom" },
    types: [
      { type: "success", background: "#a6e3a1", icon: false },
      { type: "error", background: "#f38ba8", icon: false },
      { type: "info", background: "#89b4fa", icon: false },
    ],
  });

  var els = {};

  function refreshIcons() {
    if (typeof lucide !== "undefined" && lucide.createIcons) {
      lucide.createIcons();
    }
  }

  function cacheElements() {
    els.searchInput = document.getElementById("search-input");
    els.promptList = document.getElementById("prompt-list");
    els.emptyState = document.getElementById("empty-state");
    els.editorOverlay = document.getElementById("editor-overlay");
    els.templateOverlay = document.getElementById("template-overlay");
    els.settingsOverlay = document.getElementById("settings-overlay");
    els.confirmOverlay = document.getElementById("confirm-overlay");
    els.confirmMessage = document.getElementById("confirm-message");
    els.contextMenu = document.getElementById("context-menu");
    els.editorTitle = document.getElementById("editor-title");
    els.inputTitle = document.getElementById("input-title");
    els.inputCategory = document.getElementById("input-category");
    els.inputContent = document.getElementById("input-content");
    els.inputTags = document.getElementById("input-tags");
    els.errorTitle = document.getElementById("error-title");
    els.errorContent = document.getElementById("error-content");
    els.charCount = document.getElementById("char-count");
    els.btnAdd = document.getElementById("btn-add");
    els.btnSave = document.getElementById("btn-save");
    els.btnCancel = document.getElementById("btn-cancel");
    els.btnDelete = document.getElementById("btn-delete");
    els.btnEditorClose = document.getElementById("btn-editor-close");
    els.btnSettings = document.getElementById("btn-settings");
    els.btnSettingsClose = document.getElementById("btn-settings-close");
    els.btnTemplateClose = document.getElementById("btn-template-close");
    els.btnTemplateCancel = document.getElementById("btn-template-cancel");
    els.btnTemplateInject = document.getElementById("btn-template-inject");
    els.btnInsertVar = document.getElementById("btn-insert-var");
    els.templateFields = document.getElementById("template-fields");
    els.templatePreviewContent = document.getElementById(
      "template-preview-content",
    );
    els.categoryTabs = document.getElementById("category-tabs");
    els.settingsSort = document.getElementById("settings-sort");
    els.categoryList = document.getElementById("category-list");
    els.customSiteList = document.getElementById("custom-site-list");
    els.customSiteName = document.getElementById("custom-site-name");
    els.customSitePattern = document.getElementById("custom-site-pattern");
    els.customSiteInput = document.getElementById("custom-site-input");
    els.customSiteSend = document.getElementById("custom-site-send");
    els.btnAddCustomSite = document.getElementById("btn-add-custom-site");
    els.btnCancelEditSite = document.getElementById("btn-cancel-edit-site");
    els.siteFormTitle = document.getElementById("custom-site-form-title");
    els.shortcutList = document.getElementById("shortcut-list");
    els.btnResetShortcuts = document.getElementById("btn-reset-shortcuts");
    els.btnOpenChromeShortcuts = document.getElementById(
      "btn-open-chrome-shortcuts",
    );
    els.globalShortcutValue = document.getElementById("global-shortcut-value");
    els.shortcutCaptureHint = document.getElementById("shortcut-capture-hint");
    els.btnAddCategory = document.getElementById("btn-add-category");
    els.btnExport = document.getElementById("btn-export");
    els.btnImport = document.getElementById("btn-import");
    els.btnReset = document.getElementById("btn-reset");
    els.importFile = document.getElementById("import-file");
    els.newCatIcon = document.getElementById("new-cat-icon");
    els.newCatName = document.getElementById("new-cat-name");
    els.btnTheme = document.getElementById("btn-theme");
    els.btnBatch = document.getElementById("btn-batch");
    els.btnSidepanel = document.getElementById("btn-sidepanel");
    els.batchBar = document.getElementById("batch-bar");
    els.batchCount = document.getElementById("batch-count");
    els.btnBatchDelete = document.getElementById("btn-batch-delete");
    els.btnBatchExport = document.getElementById("btn-batch-export");
    els.btnBatchCancel = document.getElementById("btn-batch-cancel");
    els.btnViewList = document.getElementById("btn-view-list");
    els.btnViewGroup = document.getElementById("btn-view-group");
    els.recentBar = document.getElementById("recent-bar");
    els.recentChips = document.getElementById("recent-chips");
    els.btnConfirmCancel = document.getElementById("btn-confirm-cancel");
    els.btnConfirmOk = document.getElementById("btn-confirm-ok");
  }

  function showToast(message, type) {
    type = type || "info";
    if (type === "success") {
      notyf.success(message);
    } else if (type === "error") {
      notyf.error(message);
    } else {
      notyf.open({ type: "info", message: message });
    }
  }

  function showConfirm(message, callback) {
    els.confirmMessage.textContent = message;
    els.confirmOverlay.classList.remove("hidden");
    confirmCallback = callback;
  }

  function openSidePanel() {
    if (!chrome.sidePanel) {
      showToast("当前浏览器不支持侧边栏", "error");
      return;
    }
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var windowId = tabs[0] && tabs[0].windowId;
      if (windowId == null) return;
      chrome.sidePanel.open({ windowId: windowId }, function () {
        if (chrome.runtime.lastError) {
          showToast("无法打开侧边栏", "error");
        }
      });
    });
  }

  function loadCustomSites() {
    PromptStorage.getCustomSites(function (sites) {
      PromptRender.renderCustomSiteList(sites, els.customSiteList);
      refreshIcons();
      markUnauthorizedSites(sites);
    });
  }

  // 逐个站点核对主机权限，未授权的打上「未授权」标记
  function markUnauthorizedSites(sites) {
    if (!chrome.permissions || !chrome.permissions.contains) return;
    sites.forEach(function (site) {
      var origin = originOfPattern(site.pattern);
      if (!origin) return;
      chrome.permissions.contains({ origins: [origin] }, function (has) {
        var badge = els.customSiteList.querySelector(
          '[data-site-perm="' + site.id + '"]',
        );
        if (badge && !has) badge.classList.remove("hidden");
      });
    });
  }

  function loadShortcuts() {
    PromptStorage.getShortcuts(function (bindings) {
      shortcutBindings = bindings;
      PromptRender.renderShortcutList(bindings, els.shortcutList);
      refreshIcons();
    });
  }

  // 读取 Chrome 全局命令当前绑定，并把结果同步给 background 供内容脚本避让
  function loadGlobalShortcuts() {
    if (!chrome.commands || !chrome.commands.getAll) return;
    chrome.commands.getAll(function (commands) {
      var bound = (commands || []).filter(function (c) {
        return !!c.shortcut;
      });
      els.globalShortcutValue.textContent = bound.length
        ? bound
            .map(function (c) {
              return c.shortcut;
            })
            .join("、")
        : "未设置";
      try {
        chrome.runtime.sendMessage(
          { type: "pp_refresh_global_shortcuts" },
          function () {
            void chrome.runtime.lastError;
          },
        );
      } catch (e) {}
    });
  }

  function stopShortcutRecording() {
    recordingShortcutId = null;
    if (els.shortcutCaptureHint) els.shortcutCaptureHint.classList.add("hidden");
    document.removeEventListener("keydown", onShortcutRecordKey, true);
  }

  function startShortcutRecording(actionId) {
    stopShortcutRecording();
    recordingShortcutId = actionId;
    if (els.shortcutCaptureHint)
      els.shortcutCaptureHint.classList.remove("hidden");
    document.addEventListener("keydown", onShortcutRecordKey, true);
  }

  function onShortcutRecordKey(event) {
    if (!recordingShortcutId) return;
    event.preventDefault();
    event.stopPropagation();

    var actionId = recordingShortcutId;
    var key = PromptUtils.keyFromKeyboardEvent(event);
    if (key === "esc") {
      stopShortcutRecording();
      loadShortcuts();
      return;
    }
    if (key === "backspace" || key === "delete") {
      saveShortcut(actionId, "");
      stopShortcutRecording();
      return;
    }
    var combo = PromptUtils.comboFromKeyboardEvent(event);
    if (!combo) return; // 只按了修饰键，继续等待主键
    saveShortcut(actionId, combo);
    stopShortcutRecording();
  }

  function saveShortcut(actionId, combo) {
    var meta = (PromptDefaults.SHORTCUT_META || []).find(function (item) {
      return item.id === actionId;
    });
    var names = {};
    (PromptDefaults.SHORTCUT_META || []).forEach(function (item) {
      names[item.id] = item.name;
    });

    var result = PromptUtils.validateShortcut(combo, {
      scope: meta && meta.scope,
      selfId: actionId,
      bindings: shortcutBindings,
      names: names,
    });
    if (!result.ok) {
      showToast(result.reason || "快捷键无效", "error");
      return;
    }

    var next = Object.assign({}, shortcutBindings);
    next[actionId] = result.combo;
    shortcutBindings = next;
    PromptStorage.saveShortcuts(next, function () {
      PromptRender.renderShortcutList(next, els.shortcutList);
      refreshIcons();
      showToast(
        result.combo
          ? "已设为 " + PromptUtils.formatShortcut(result.combo)
          : "已清除该快捷键",
        "success",
      );
    });
  }

  // 从用户填写的网址推导申请权限用的 origin（https://example.com/*）
  function originOfPattern(pattern) {
    return PromptUtils.originOfPattern(pattern);
  }

  function resetSiteForm() {
    editingSiteId = null;
    els.customSiteName.value = "";
    els.customSitePattern.value = "";
    els.customSiteInput.value = "";
    els.customSiteSend.value = "";
    els.btnAddCustomSite.textContent = "添加";
    els.btnCancelEditSite.classList.add("hidden");
    if (els.siteFormTitle) els.siteFormTitle.textContent = "添加站点";
  }

  function fillSiteForm(site) {
    editingSiteId = site.id;
    els.customSiteName.value = site.name || "";
    els.customSitePattern.value = site.pattern || "";
    els.customSiteInput.value = site.inputSelector || "";
    els.customSiteSend.value = site.sendSelector || "";
    els.btnAddCustomSite.textContent = "保存";
    els.btnCancelEditSite.classList.remove("hidden");
    if (els.siteFormTitle) els.siteFormTitle.textContent = "编辑站点";
    els.customSiteName.focus();
  }

  // 权限是脚本能否注入的前提：未授权时保存但标注，避免用户以为功能坏了
  function requestSitePermission(origin, onResult) {
    if (!chrome.permissions || !chrome.permissions.contains) {
      onResult(true);
      return;
    }
    chrome.permissions.contains({ origins: [origin] }, function (has) {
      if (has) {
        onResult(true);
        return;
      }
      if (!chrome.permissions.request) {
        onResult(false);
        return;
      }
      chrome.permissions.request({ origins: [origin] }, function (granted) {
        onResult(!!granted);
      });
    });
  }

  function syncSiteScripts() {
    try {
      chrome.runtime.sendMessage({ type: "pp_sync_sites" }, function () {
        void chrome.runtime.lastError;
      });
    } catch (e) {}
  }

  function submitCustomSite() {
    var name = els.customSiteName.value.trim();
    var pattern = els.customSitePattern.value.trim();
    var inputSelector = els.customSiteInput.value.trim();
    var sendSelector = els.customSiteSend.value.trim();

    if (!name || !pattern || !inputSelector) {
      showToast("请填写站点名称、网址和输入框选择器", "error");
      return;
    }
    var origin = originOfPattern(pattern);
    if (!origin) {
      showToast("网址格式不正确，需形如 https://example.com/*", "error");
      return;
    }

    var isEdit = !!editingSiteId;
    PromptStorage.getCustomSites(function (sites) {
      var existing = isEdit
        ? sites.find(function (s) {
            return s.id === editingSiteId;
          })
        : null;

      var site = {
        id: existing ? existing.id : PromptUtils.generateId("site"),
        name: name,
        pattern: pattern,
        inputSelector: inputSelector,
        sendSelector: sendSelector,
        enabled: existing ? existing.enabled !== false : true,
      };

      requestSitePermission(origin, function (granted) {
        PromptStorage.saveCustomSite(site, function () {
          resetSiteForm();
          loadCustomSites();
          syncSiteScripts();
          if (!granted) {
            showToast("已保存，但未授权该站点，无法自动注入", "error");
          } else {
            showToast(isEdit ? "站点已更新" : "站点已添加", "success");
          }
        });
      });
    });
  }
  function closeConfirm() {
    els.confirmOverlay.classList.add("hidden");
    confirmCallback = null;
  }

  function hideContextMenu() {
    els.contextMenu.classList.add("hidden");
    contextTargetId = null;
  }

  function loadPrompts() {
    var filter = els.searchInput.value.trim();
    PromptStorage.loadData(function (data) {
      var prompts = data.prompts || [];
      var categories = data.categories || [];
      var sortBy = data.sortBy || "updatedAt";
      var sortOrder = data.sortOrder || "desc";
      var promptOrder = data.promptOrder || {};

      PromptRender.renderCategoryTabs(
        categories,
        currentCategory,
        els.categoryTabs,
      );

      var renderParams = {
        prompts: prompts,
        categories: categories,
        filter: filter,
        currentCategory: currentCategory,
        sortBy: sortBy,
        sortOrder: sortOrder,
        promptOrder: promptOrder,
        listEl: els.promptList,
        emptyEl: els.emptyState,
        batchMode: batchMode,
        selectedIds: selectedIds,
      };

      if (viewMode === "group") {
        PromptRender.renderGroupedPromptList(renderParams);
      } else {
        PromptRender.renderPromptList(renderParams);
      }

      updatePromptSortable(sortBy);
      updateKeyboardSelection();
      refreshIcons();
    });
  }

  function loadRecentBar() {
    PromptStorage.getRecentPrompt(5, function (prompts) {
      PromptRender.renderRecentChips(prompts, els.recentChips);
    });
  }

  function updatePromptSortable(sortBy) {
    if (promptListSortable) {
      promptListSortable.destroy();
      promptListSortable = null;
    }
    if (sortBy === "custom" && typeof Sortable !== "undefined" && !batchMode) {
      promptListSortable = Sortable.create(els.promptList, {
        animation: 150,
        ghostClass: "sortable-ghost",
        onEnd: function () {
          var orderedIds = [];
          els.promptList.querySelectorAll("[data-id]").forEach(function (el) {
            orderedIds.push(el.dataset.id);
          });
          PromptStorage.savePromptOrder(
            orderedIds,
            currentCategory,
            function () {},
          );
        },
      });
    }
  }

  function updateKeyboardSelection() {
    var items = els.promptList.querySelectorAll(".prompt-item");
    items.forEach(function (item, idx) {
      if (idx === selectedIdx) {
        item.classList.add("keyboard-selected");
      } else {
        item.classList.remove("keyboard-selected");
      }
    });
  }

  function updateBatchUI() {
    if (batchMode) {
      els.btnBatch.classList.add("active");
      els.batchBar.classList.remove("hidden");
      els.batchCount.textContent = "已选 " + selectedIds.size + " 项";
    } else {
      els.btnBatch.classList.remove("active");
      els.batchBar.classList.add("hidden");
      selectedIds.clear();
      selectedIdx = -1;
    }
  }

  function doInject(text, promptId) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs[0]) {
        showToast("无法获取当前标签页", "error");
        return;
      }
      var tabId = tabs[0].id;
      chrome.tabs.sendMessage(
        tabId,
        { type: "inject_prompt", text: text, shouldSubmit: false },
        function (response) {
          if (chrome.runtime.lastError) {
            chrome.scripting.executeScript(
              {
                target: { tabId: tabId },
                files: PromptDefaults.CONTENT_SCRIPT_FILES,
              },
              function () {
                if (chrome.runtime.lastError) {
                  showToast("此页面不支持注入", "error");
                  return;
                }
                chrome.tabs.sendMessage(
                  tabId,
                  { type: "inject_prompt", text: text, shouldSubmit: false },
                  function (resp) {
                    if (chrome.runtime.lastError || !resp || !resp.success) {
                      showToast("注入失败，未找到输入框", "error");
                      return;
                    }
                    onInjectSuccess(promptId);
                  },
                );
              },
            );
            return;
          }
          if (!response || !response.success) {
            showToast(
              "注入失败：" + (response ? response.error : "未找到输入框"),
              "error",
            );
            return;
          }
          onInjectSuccess(promptId);
        },
      );
    });
  }

  function onInjectSuccess(promptId) {
    if (promptId) {
      PromptStorage.incrementUsage(promptId);
    }
    showToast("已注入提示词", "success");
    setTimeout(function () {
      window.close();
    }, 400);
  }

  function handleInject(id) {
    PromptStorage.getPrompts(function (prompts) {
      var prompt = prompts.find(function (p) {
        return p.id === id;
      });
      if (!prompt) return;

      if (PromptUtils.hasVariables(prompt.content)) {
        PromptEditor.openTemplateFill(prompt, els);
      } else {
        doInject(prompt.content, id);
      }
    });
  }

  function handleAction(action, id) {
    if (action === "inject") {
      handleInject(id);
    } else if (action === "pin") {
      PromptStorage.togglePin(id, loadPrompts);
    } else if (action === "edit") {
      PromptStorage.getPrompts(function (prompts) {
        var prompt = prompts.find(function (p) {
          return p.id === id;
        });
        if (prompt) {
          PromptStorage.getCategories(function (categories) {
            PromptEditor.openEditor(prompt, categories, currentCategory, els);
          });
        }
      });
    } else if (action === "duplicate") {
      PromptStorage.duplicatePrompt(id, function () {
        showToast("已复制提示词", "success");
        loadPrompts();
      });
      refreshIcons();
    } else if (action === "delete") {
      showConfirm("确定要删除这条提示词吗？", function () {
        PromptStorage.deletePrompt(id, function () {
          showToast("已删除", "info");
          PromptEditor.closeEditor(els);
          loadPrompts();
        });
      });
    }
  }

  function bindEvents() {
    els.promptList.addEventListener("click", function (e) {
      var batchCheckbox = e.target.closest(".batch-checkbox");
      if (batchCheckbox) {
        var bid = batchCheckbox.dataset.batchId;
        if (batchCheckbox.checked) {
          selectedIds.add(bid);
        } else {
          selectedIds.delete(bid);
        }
        updateBatchUI();
        return;
      }

      var btn = e.target.closest("[data-action]");
      if (btn) {
        var item = btn.closest(".prompt-item");
        var id = item && item.dataset.id;
        if (!id) return;
        handleAction(btn.dataset.action, id);
        return;
      }

      if (batchMode) {
        var checkboxItem = e.target.closest(".prompt-item");
        if (checkboxItem) {
          var cid = checkboxItem.dataset.id;
          var cb = checkboxItem.querySelector(".batch-checkbox");
          if (cb) {
            cb.checked = !cb.checked;
            if (cb.checked) {
              selectedIds.add(cid);
            } else {
              selectedIds.delete(cid);
            }
            updateBatchUI();
          }
        }
        return;
      }

      var contentArea = e.target.closest(".prompt-item-content");
      if (contentArea) {
        var promptItem = contentArea.closest(".prompt-item");
        if (promptItem) {
          handleInject(promptItem.dataset.id);
        }
      }
    });

    els.promptList.addEventListener("contextmenu", function (e) {
      var item = e.target.closest(".prompt-item");
      if (!item) return;
      e.preventDefault();
      contextTargetId = item.dataset.id;
      var rect = els.promptList.getBoundingClientRect();
      var x = Math.min(e.clientX - rect.left, rect.width - 150);
      var y = Math.min(e.clientY - rect.top, rect.height - 180);
      els.contextMenu.style.left = x + "px";
      els.contextMenu.style.top = y + "px";
      els.contextMenu.classList.remove("hidden");
    });

    els.contextMenu.addEventListener("click", function (e) {
      var item = e.target.closest(".ctx-item");
      if (!item || !contextTargetId) return;
      handleAction(item.dataset.action, contextTargetId);
      hideContextMenu();
    });

    document.addEventListener("click", function (e) {
      if (!els.contextMenu.contains(e.target)) {
        hideContextMenu();
      }
    });

    els.promptList.addEventListener("click", function (e) {
      var header = e.target.closest(".category-group-header");
      if (header) {
        var catId = header.dataset.groupCat;
        var items = els.promptList.querySelector(
          '[data-group-items="' + catId + '"]',
        );
        if (items) {
          header.classList.toggle("collapsed");
          items.classList.toggle("collapsed");
        }
      }
    });

    els.categoryTabs.addEventListener("click", function (e) {
      var tab = e.target.closest(".cat-tab");
      if (!tab) return;
      currentCategory = tab.dataset.cat;
      selectedIdx = -1;
      els.categoryTabs.querySelectorAll(".cat-tab").forEach(function (t) {
        t.classList.remove("active");
      });
      tab.classList.add("active");
      loadPrompts();
    });

    els.btnAdd.addEventListener("click", function () {
      PromptStorage.loadData(function (data) {
        PromptEditor.openEditor(null, data.categories, currentCategory, els);
      });
    });

    els.btnSidepanel.addEventListener("click", openSidePanel);

    els.btnSave.addEventListener("click", function () {
      PromptEditor.savePrompt(els, function () {
        showToast(App.editingId ? "已保存修改" : "已添加提示词", "success");
        loadPrompts();
        loadRecentBar();
      });
    });

    els.btnCancel.addEventListener("click", function () {
      PromptEditor.closeEditor(els);
    });

    els.btnEditorClose.addEventListener("click", function () {
      PromptEditor.closeEditor(els);
    });

    els.btnDelete.addEventListener("click", function () {
      if (editingId) {
        showConfirm("确定要删除这条提示词吗？", function () {
          PromptStorage.deletePrompt(editingId, function () {
            showToast("已删除", "info");
            PromptEditor.closeEditor(els);
            loadPrompts();
          });
        });
      }
    });

    els.btnInsertVar.addEventListener("click", function () {
      PromptEditor.insertVariable(els);
    });

    els.inputContent.addEventListener("input", function () {
      PromptEditor.updateCharCount(els);
    });

    els.btnTemplateClose.addEventListener("click", function () {
      PromptEditor.closeTemplateFill(els);
    });

    els.btnTemplateCancel.addEventListener("click", function () {
      PromptEditor.closeTemplateFill(els);
    });

    els.btnTemplateInject.addEventListener("click", function () {
      PromptEditor.injectTemplate(els, function (filled, promptId) {
        doInject(filled, promptId);
      });
    });

    els.btnSettings.addEventListener("click", function () {
      PromptStorage.loadData(function (data) {
        PromptEditor.openSettings(els, data);
        loadCustomSites();
        loadShortcuts();
        loadGlobalShortcuts();
      });
    });

    els.btnSettingsClose.addEventListener("click", function () {
      stopShortcutRecording();
      PromptEditor.closeSettings(els, loadPrompts);
    });

    els.settingsSort.addEventListener("change", function () {
      PromptStorage.saveSortSetting(els.settingsSort.value, loadPrompts);
    });

    els.btnAddCategory.addEventListener("click", function () {
      PromptEditor.addCategory(els, loadPrompts);
    });

    els.btnAddCustomSite.addEventListener("click", submitCustomSite);

    els.btnCancelEditSite.addEventListener("click", function () {
      resetSiteForm();
    });

    els.customSiteList.addEventListener("change", function (e) {
      var toggle = e.target.closest("[data-site-toggle]");
      if (!toggle) return;
      var siteId = toggle.dataset.siteToggle;
      var enabled = toggle.checked;
      PromptStorage.toggleCustomSite(siteId, enabled, function () {
        loadCustomSites();
        syncSiteScripts();
        showToast(enabled ? "站点已启用" : "站点已禁用", "info");
      });
    });

    els.customSiteList.addEventListener("click", function (e) {
      var editButton = e.target.closest("[data-site-edit]");
      if (editButton) {
        var editId = editButton.dataset.siteEdit;
        PromptStorage.getCustomSites(function (sites) {
          var site = sites.find(function (s) {
            return s.id === editId;
          });
          if (site) fillSiteForm(site);
        });
        return;
      }

      var deleteButton = e.target.closest("[data-site-delete]");
      if (!deleteButton) return;
      var deleteId = deleteButton.dataset.siteDelete;
      showConfirm("确定要删除这个自定义站点吗？", function () {
        PromptStorage.getCustomSites(function (sites) {
          var target = sites.find(function (s) {
            return s.id === deleteId;
          });
          PromptStorage.deleteCustomSite(deleteId, function () {
            if (target) {
              try {
                chrome.runtime.sendMessage(
                  {
                    type: "pp_revoke_site",
                    siteId: deleteId,
                    origin: originOfPattern(target.pattern),
                  },
                  function () {
                    void chrome.runtime.lastError;
                  },
                );
              } catch (err) {}
            }
            if (editingSiteId === deleteId) resetSiteForm();
            loadCustomSites();
            showToast("站点已删除", "info");
          });
        });
      });
    });

    els.shortcutList.addEventListener("click", function (e) {
      var recordButton = e.target.closest("[data-sc-record]");
      if (recordButton) {
        startShortcutRecording(recordButton.dataset.scRecord);
        return;
      }
      var resetButton = e.target.closest("[data-sc-reset]");
      if (!resetButton) return;
      var actionId = resetButton.dataset.scReset;
      var meta = (PromptDefaults.SHORTCUT_META || []).find(function (item) {
        return item.id === actionId;
      });
      saveShortcut(actionId, (meta && meta.def) || "");
    });

    els.btnResetShortcuts.addEventListener("click", function () {
      showConfirm("确定要恢复默认快捷键吗？", function () {
        PromptStorage.resetShortcuts(function (defaults) {
          shortcutBindings = defaults;
          PromptRender.renderShortcutList(defaults, els.shortcutList);
          refreshIcons();
          showToast("已恢复默认快捷键", "success");
        });
      });
    });

    els.btnOpenChromeShortcuts.addEventListener("click", function () {
      try {
        chrome.tabs.create({ url: "chrome://extensions/shortcuts" }, function () {
          void chrome.runtime.lastError;
        });
      } catch (e) {
        showToast("无法打开 Chrome 快捷键设置", "error");
      }
    });

    els.categoryList.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-cat-delete]");
      if (!btn) return;
      var deletedId = btn.dataset.catDelete;
      showConfirm(
        "删除分类后，该分类下的提示词将移至「自定义」分类。确定删除？",
        function () {
          if (currentCategory === deletedId) currentCategory = "all";
          PromptEditor.deleteCategory(deletedId, els, loadPrompts);
        },
      );
    });

    els.btnExport.addEventListener("click", function () {
      PromptStorage.exportData();
      showToast("导出成功", "success");
    });

    els.btnImport.addEventListener("click", function () {
      els.importFile.click();
    });

    els.importFile.addEventListener("change", function (e) {
      var file = e.target.files[0];
      if (!file) return;
      PromptEditor.handleImportFile(file, function () {
        loadPrompts();
        loadRecentBar();
      });
      els.importFile.value = "";
    });

    els.btnReset.addEventListener("click", function () {
      showConfirm(
        "确定要重置预设数据吗？这将恢复所有内置分类和提示词模板（不会删除你自定义的数据）。",
        function () {
          PromptEditor.resetPresets(function () {
            loadPrompts();
            loadRecentBar();
          });
        },
      );
    });

    els.btnTheme.addEventListener("click", function () {
      var current = document.body.getAttribute("data-theme") || "dark";
      var next = current === "dark" ? "light" : "dark";
      document.body.setAttribute("data-theme", next);
      els.btnTheme.innerHTML =
        '<i data-lucide="' + (next === "dark" ? "sun-moon" : "moon") + '"></i>';
      refreshIcons();
      PromptStorage.saveThemePreference(next);
    });

    els.btnBatch.addEventListener("click", function () {
      batchMode = !batchMode;
      if (!batchMode) {
        selectedIds.clear();
      }
      updateBatchUI();
      loadPrompts();
    });

    els.btnBatchDelete.addEventListener("click", function () {
      if (selectedIds.size === 0) {
        showToast("请先选择提示词", "info");
        return;
      }
      showConfirm(
        "确定要删除选中的 " + selectedIds.size + " 条提示词吗？",
        function () {
          PromptStorage.deletePrompts(Array.from(selectedIds), function () {
            showToast("已删除 " + selectedIds.size + " 条提示词", "info");
            selectedIds.clear();
            batchMode = false;
            updateBatchUI();
            loadPrompts();
          });
        },
      );
    });

    els.btnBatchExport.addEventListener("click", function () {
      if (selectedIds.size === 0) {
        showToast("请先选择提示词", "info");
        return;
      }
      PromptStorage.exportSelectedData(Array.from(selectedIds));
      showToast("已导出 " + selectedIds.size + " 条提示词", "success");
    });

    els.btnBatchCancel.addEventListener("click", function () {
      batchMode = false;
      selectedIds.clear();
      updateBatchUI();
      loadPrompts();
    });

    els.btnViewList.addEventListener("click", function () {
      viewMode = "list";
      els.btnViewList.classList.add("active");
      els.btnViewGroup.classList.remove("active");
      PromptStorage.saveViewMode("list");
      loadPrompts();
    });

    els.btnViewGroup.addEventListener("click", function () {
      viewMode = "group";
      els.btnViewGroup.classList.add("active");
      els.btnViewList.classList.remove("active");
      PromptStorage.saveViewMode("group");
      loadPrompts();
    });

    els.recentChips.addEventListener("click", function (e) {
      var chip = e.target.closest(".recent-chip");
      if (!chip) return;
      handleInject(chip.dataset.recentId);
    });

    els.btnConfirmCancel.addEventListener("click", closeConfirm);
    els.btnConfirmOk.addEventListener("click", function () {
      if (confirmCallback) confirmCallback();
      closeConfirm();
    });

    els.confirmOverlay.addEventListener("click", function (e) {
      if (e.target === els.confirmOverlay) closeConfirm();
    });

    els.searchInput.addEventListener("input", function () {
      selectedIdx = -1;
      loadPrompts();
    });

    els.editorOverlay.addEventListener("click", function (e) {
      if (e.target === els.editorOverlay) PromptEditor.closeEditor(els);
    });

    els.templateOverlay.addEventListener("click", function (e) {
      if (e.target === els.templateOverlay) PromptEditor.closeTemplateFill(els);
    });

    els.settingsOverlay.addEventListener("click", function (e) {
      if (e.target !== els.settingsOverlay) return;
      stopShortcutRecording();
      PromptEditor.closeSettings(els, loadPrompts);
    });

    bindHotkeys();
  }

  function allOverlaysHidden() {
    return (
      els.confirmOverlay.classList.contains("hidden") &&
      els.editorOverlay.classList.contains("hidden") &&
      els.templateOverlay.classList.contains("hidden") &&
      els.settingsOverlay.classList.contains("hidden")
    );
  }

  function bindHotkeys() {
    if (typeof hotkeys === "undefined") return;
    hotkeys.filter = function () {
      return true;
    };

    hotkeys("esc", function () {
      if (!els.confirmOverlay.classList.contains("hidden")) {
        closeConfirm();
        return;
      }
      if (!els.templateOverlay.classList.contains("hidden")) {
        PromptEditor.closeTemplateFill(els);
        return;
      }
      if (!els.editorOverlay.classList.contains("hidden")) {
        PromptEditor.closeEditor(els);
        return;
      }
      if (!els.settingsOverlay.classList.contains("hidden")) {
        PromptEditor.closeSettings(els, loadPrompts);
        return;
      }
      if (batchMode) {
        batchMode = false;
        selectedIds.clear();
        updateBatchUI();
        loadPrompts();
      }
      hideContextMenu();
    });

    hotkeys("ctrl+n", function (e) {
      e.preventDefault();
      PromptStorage.loadData(function (data) {
        PromptEditor.openEditor(null, data.categories, currentCategory, els);
      });
    });

    hotkeys("up,down", function (e) {
      if (!allOverlaysHidden()) return;
      e.preventDefault();
      var items = els.promptList.querySelectorAll(".prompt-item");
      if (items.length === 0) return;
      if (e.key === "ArrowDown") {
        selectedIdx = selectedIdx < items.length - 1 ? selectedIdx + 1 : 0;
      } else {
        selectedIdx = selectedIdx > 0 ? selectedIdx - 1 : items.length - 1;
      }
      updateKeyboardSelection();
      items[selectedIdx].scrollIntoView({ block: "nearest" });
    });

    hotkeys("enter", function (e) {
      if (!allOverlaysHidden()) return;
      if (selectedIdx < 0 || document.activeElement !== els.searchInput) return;
      e.preventDefault();
      var items = els.promptList.querySelectorAll(".prompt-item");
      if (!items[selectedIdx]) return;
      var id = items[selectedIdx].dataset.id;
      if (batchMode) {
        var cb = items[selectedIdx].querySelector(".batch-checkbox");
        if (cb) {
          cb.checked = !cb.checked;
          if (cb.checked) selectedIds.add(id);
          else selectedIds.delete(id);
          updateBatchUI();
        }
      } else {
        handleInject(id);
      }
    });
  }

  function init() {
    cacheElements();
    bindEvents();
    refreshIcons();

    PromptStorage.getThemePreference(function (theme) {
      document.body.setAttribute("data-theme", theme);
      els.btnTheme.innerHTML =
        '<i data-lucide="' +
        (theme === "dark" ? "sun-moon" : "moon") +
        '"></i>';
      refreshIcons();
    });

    PromptStorage.getViewMode(function (mode) {
      viewMode = mode || "list";
      if (viewMode === "group") {
        els.btnViewGroup.classList.add("active");
        els.btnViewList.classList.remove("active");
      } else {
        els.btnViewList.classList.add("active");
        els.btnViewGroup.classList.remove("active");
      }
    });

    loadPrompts();
    loadRecentBar();
    els.searchInput.focus();
  }

  return {
    init: init,
    showToast: showToast,
    get editingId() {
      return editingId;
    },
    set editingId(val) {
      editingId = val;
    },
    get currentCategory() {
      return currentCategory;
    },
  };
})();

document.addEventListener("DOMContentLoaded", App.init);
