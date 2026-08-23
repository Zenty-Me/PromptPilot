var PromptRender = (function () {
  function escapeHtml(str) {
    return PromptUtils.escapeHtml(str);
  }

  function highlightVariables(text) {
    var escaped = escapeHtml(text);
    return escaped.replace(
      /\{\{([^}]+)\}\}/g,
      '<span class="var-highlight">{{$1}}</span>',
    );
  }

  function renderCategoryTabs(categories, currentCategory, container) {
    var tabs =
      '<button class="cat-tab ' +
      (currentCategory === "all" ? "active" : "") +
      '" data-cat="all">全部</button>';
    categories.sort(function (a, b) {
      return (a.order || 0) - (b.order || 0);
    });
    categories.forEach(function (cat) {
      tabs +=
        '<button class="cat-tab ' +
        (currentCategory === cat.id ? "active" : "") +
        '" data-cat="' +
        cat.id +
        '">' +
        escapeHtml(cat.name) +
        "</button>";
    });
    container.innerHTML = tabs;
  }

  function populateCategorySelect(categories, selectedId, selectEl) {
    var html = "";
    categories.sort(function (a, b) {
      return (a.order || 0) - (b.order || 0);
    });
    categories.forEach(function (cat) {
      html +=
        '<option value="' +
        cat.id +
        '"' +
        (cat.id === selectedId ? " selected" : "") +
        ">" +
        escapeHtml(cat.name) +
        "</option>";
    });
    selectEl.innerHTML = html;
  }

  function sortPrompts(
    prompts,
    sortBy,
    sortOrder,
    promptOrder,
    currentCategory,
  ) {
    var sorted = prompts.slice();
    if (sortBy === "custom" && promptOrder) {
      var key = currentCategory || "all";
      var orderList = promptOrder[key] || [];
      var orderMap = {};
      orderList.forEach(function (id, i) {
        orderMap[id] = i;
      });
      sorted.sort(function (a, b) {
        var aPinned = a.pinned ? -1 : 0;
        var bPinned = b.pinned ? -1 : 0;
        if (aPinned !== bPinned) return aPinned - bPinned;
        var aOrd = orderMap[a.id] !== undefined ? orderMap[a.id] : 99999;
        var bOrd = orderMap[b.id] !== undefined ? orderMap[b.id] : 99999;
        if (aOrd !== bOrd) return aOrd - bOrd;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });
      return sorted;
    }
    sorted.sort(function (a, b) {
      var aPinned = a.pinned ? 1 : 0;
      var bPinned = b.pinned ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;

      var aVal, bVal;
      if (sortBy === "title") {
        aVal = (a.title || "").toLowerCase();
        bVal = (b.title || "").toLowerCase();
        if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
        if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
        return 0;
      } else if (sortBy === "usageCount") {
        aVal = a.usageCount || 0;
        bVal = b.usageCount || 0;
      } else {
        aVal = a.updatedAt || 0;
        bVal = b.updatedAt || 0;
      }
      return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
    });
    return sorted;
  }

  function buildPromptItemHtml(p, batchMode, selectedIds) {
    var hasVars = PromptUtils.hasVariables(p.content);
    var isChecked = batchMode && selectedIds && selectedIds.has(p.id);
    return (
      '<div class="prompt-item' +
      (batchMode ? " batch-mode" : "") +
      '" data-id="' +
      p.id +
      '">' +
      '<input type="checkbox" class="batch-checkbox" data-batch-id="' +
      p.id +
      '"' +
      (isChecked ? " checked" : "") +
      " />" +
      '<div class="prompt-item-content">' +
      '<div class="prompt-item-header">' +
      '<span class="prompt-item-title">' +
      escapeHtml(p.title) +
      "</span>" +
      (p.pinned ? '<i class="pin-badge" data-lucide="pin"></i>' : "") +
      (hasVars ? '<span class="template-badge">模板</span>' : "") +
      (p.usageCount > 0
        ? '<span class="usage-count">' + p.usageCount + "次</span>"
        : "") +
      "</div>" +
      '<div class="prompt-item-preview">' +
      highlightVariables(p.content) +
      "</div>" +
      (p.tags && p.tags.length
        ? '<div class="prompt-item-tags">' +
          p.tags
            .map(function (t) {
              return '<span class="tag">' + escapeHtml(t) + "</span>";
            })
            .join("") +
          "</div>"
        : "") +
      "</div>" +
      '<div class="prompt-item-actions">' +
      '<button class="btn-small btn-inject" data-action="inject" title="注入"><i data-lucide="send"></i></button>' +
      '<button class="btn-small btn-pin" data-action="pin" title="' +
      (p.pinned ? "取消置顶" : "置顶") +
      '">' +
      '<i data-lucide="pin"></i>' +
      "</button>" +
      '<button class="btn-small btn-edit" data-action="edit" title="编辑"><i data-lucide="pencil"></i></button>' +
      '<button class="btn-small btn-duplicate" data-action="duplicate" title="复制"><i data-lucide="copy"></i></button>' +
      '<button class="btn-small btn-delete" data-action="delete" title="删除"><i data-lucide="trash-2"></i></button>' +
      "</div>" +
      "</div>"
    );
  }

  function renderPromptList(params) {
    var prompts = params.prompts;
    var categories = params.categories;
    var filter = params.filter;
    var currentCategory = params.currentCategory;
    var sortBy = params.sortBy;
    var sortOrder = params.sortOrder;
    var promptOrder = params.promptOrder;
    var listEl = params.listEl;
    var emptyEl = params.emptyEl;
    var batchMode = params.batchMode;
    var selectedIds = params.selectedIds;

    var catMap = {};
    categories.forEach(function (c) {
      catMap[c.id] = c;
    });

    var filtered = prompts;
    if (currentCategory !== "all") {
      filtered = filtered.filter(function (p) {
        return p.categoryId === currentCategory;
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

    filtered = sortPrompts(
      filtered,
      sortBy,
      sortOrder,
      promptOrder,
      currentCategory,
    );

    if (filtered.length === 0) {
      listEl.classList.add("hidden");
      emptyEl.classList.remove("hidden");
      if (filter || currentCategory !== "all") {
        emptyEl.querySelector("p").textContent = "没有匹配的提示词";
        emptyEl.querySelector(".empty-hint").textContent =
          "换个关键词，或切回「全部」分类";
      } else {
        emptyEl.querySelector("p").textContent = "提示词库还是空的";
        emptyEl.querySelector(".empty-hint").textContent =
          "点右上角 +，写下第一条，随时注入到任意 AI 对话";
      }
    } else {
      listEl.classList.remove("hidden");
      emptyEl.classList.add("hidden");
    }

    listEl.innerHTML = filtered
      .map(function (p) {
        return buildPromptItemHtml(p, batchMode, selectedIds);
      })
      .join("");
  }

  function renderGroupedPromptList(params) {
    var prompts = params.prompts;
    var categories = params.categories;
    var filter = params.filter;
    var currentCategory = params.currentCategory;
    var sortBy = params.sortBy;
    var sortOrder = params.sortOrder;
    var promptOrder = params.promptOrder;
    var listEl = params.listEl;
    var emptyEl = params.emptyEl;
    var batchMode = params.batchMode;
    var selectedIds = params.selectedIds;

    var catMap = {};
    categories.forEach(function (c) {
      catMap[c.id] = c;
    });

    var filtered = prompts;
    if (currentCategory !== "all") {
      filtered = filtered.filter(function (p) {
        return p.categoryId === currentCategory;
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

    if (filtered.length === 0) {
      listEl.classList.add("hidden");
      emptyEl.classList.remove("hidden");
      if (filter || currentCategory !== "all") {
        emptyEl.querySelector("p").textContent = "没有匹配的提示词";
        emptyEl.querySelector(".empty-hint").textContent =
          "换个关键词，或切回「全部」分类";
      } else {
        emptyEl.querySelector("p").textContent = "提示词库还是空的";
        emptyEl.querySelector(".empty-hint").textContent =
          "点右上角 +，写下第一条，随时注入到任意 AI 对话";
      }
      return;
    }

    listEl.classList.remove("hidden");
    emptyEl.classList.add("hidden");

    var groups = {};
    var catOrder = [];
    categories.sort(function (a, b) {
      return (a.order || 0) - (b.order || 0);
    });
    categories.forEach(function (cat) {
      groups[cat.id] = [];
      catOrder.push(cat);
    });

    filtered.forEach(function (p) {
      var cid = p.categoryId;
      if (!groups[cid]) {
        groups[cid] = [];
        catOrder.push({ id: cid, name: "未分类", icon: "📁", order: 999 });
      }
      groups[cid].push(p);
    });

    var html = "";
    catOrder.forEach(function (cat) {
      var items = groups[cat.id];
      if (!items || items.length === 0) return;
      var sorted = sortPrompts(
        items,
        sortBy,
        sortOrder,
        promptOrder,
        currentCategory,
      );
      html +=
        '<div class="category-group">' +
        '<div class="category-group-header" data-group-cat="' +
        cat.id +
        '">' +
        '<span class="collapse-icon">▼</span> ' +
        escapeHtml(cat.icon || "") +
        " " +
        escapeHtml(cat.name) +
        " (" +
        sorted.length +
        ")" +
        "</div>" +
        '<div class="category-group-items" data-group-items="' +
        cat.id +
        '">' +
        sorted
          .map(function (p) {
            return buildPromptItemHtml(p, batchMode, selectedIds);
          })
          .join("") +
        "</div>" +
        "</div>";
    });

    listEl.innerHTML = html;
  }

  function renderRecentChips(prompts, container) {
    if (!prompts || prompts.length === 0) {
      container.parentElement.classList.add("hidden");
      return;
    }
    container.parentElement.classList.remove("hidden");
    container.innerHTML = prompts
      .map(function (p) {
        return (
          '<button class="recent-chip" data-recent-id="' +
          p.id +
          '">' +
          escapeHtml(p.title) +
          "</button>"
        );
      })
      .join("");
  }

  function renderCategoryManageList(categories, container) {
    categories.sort(function (a, b) {
      return (a.order || 0) - (b.order || 0);
    });
    container.innerHTML = categories
      .map(function (cat) {
        return (
          '<div class="category-manage-item" data-cat-id="' +
          cat.id +
          '">' +
          '<span class="cat-item-icon" title="拖拽排序"><i data-lucide="grip-vertical"></i>' +
          "</span>" +
          '<span class="cat-item-name">' +
          escapeHtml(cat.name) +
          "</span>" +
          '<button class="cat-item-delete" data-cat-delete="' +
          cat.id +
          '" title="删除"><i data-lucide="trash-2"></i></button>' +
          "</div>"
        );
      })
      .join("");
  }

  function renderCustomSiteList(sites, container) {
    container.innerHTML = (sites || [])
      .map(function (site) {
        return (
          '<div class="custom-site-item" data-site-id="' +
          site.id +
          '">' +
          '<div class="custom-site-info"><strong>' +
          escapeHtml(site.name) +
          "</strong><span>" +
          escapeHtml(site.pattern) +
          "</span></div>" +
          '<button class="cat-item-delete" data-site-delete="' +
          site.id +
          '" title="删除"><i data-lucide="trash-2"></i></button>' +
          "</div>"
        );
      })
      .join("");
  }

  return {
    renderCategoryTabs: renderCategoryTabs,
    populateCategorySelect: populateCategorySelect,
    sortPrompts: sortPrompts,
    renderPromptList: renderPromptList,
    renderGroupedPromptList: renderGroupedPromptList,
    renderRecentChips: renderRecentChips,
    renderCategoryManageList: renderCategoryManageList,
    renderCustomSiteList: renderCustomSiteList,
  };
})();
