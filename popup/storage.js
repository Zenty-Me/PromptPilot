var PromptStorage = (function () {
  var STORAGE = chrome.storage.local;

  var DEFAULTS = {
    categories: [],
    prompts: [],
    initialized: false,
    sortBy: "updatedAt",
    sortOrder: "desc",
    theme: "dark",
    viewMode: "list",
    promptOrder: {},
    customSites: [],
  };

  function ensureDefaults(callback) {
    STORAGE.get(DEFAULTS, function (data) {
      if (!data.initialized) {
        STORAGE.set(
          {
            categories: PromptDefaults.CATEGORIES,
            prompts: PromptDefaults.PROMPTS,
            initialized: true,
            sortBy: "updatedAt",
            sortOrder: "desc",
            theme: "dark",
            viewMode: "list",
            promptOrder: {},
          },
          function () {
            callback();
          },
        );
      } else {
        callback();
      }
    });
  }

  function loadData(callback) {
    STORAGE.get(DEFAULTS, function (data) {
      if (!data.initialized) {
        STORAGE.set(
          {
            categories: PromptDefaults.CATEGORIES,
            prompts: PromptDefaults.PROMPTS,
            initialized: true,
            sortBy: "updatedAt",
            sortOrder: "desc",
            theme: "dark",
            viewMode: "list",
            promptOrder: {},
          },
          function () {
            STORAGE.get(
              {
                categories: [],
                prompts: [],
                sortBy: "updatedAt",
                sortOrder: "desc",
                theme: "dark",
                viewMode: "list",
                promptOrder: {},
              },
              callback,
            );
          },
        );
      } else {
        callback(data);
      }
    });
  }

  function getPrompts(callback) {
    STORAGE.get({ prompts: [] }, function (data) {
      callback(data.prompts || []);
    });
  }

  function savePrompt(editingId, title, content, tags, categoryId, callback) {
    STORAGE.get({ prompts: [] }, function (data) {
      var prompts = data.prompts || [];
      if (editingId) {
        var idx = prompts.findIndex(function (p) {
          return p.id === editingId;
        });
        if (idx !== -1) {
          prompts[idx] = Object.assign({}, prompts[idx], {
            title: title,
            content: content,
            tags: tags,
            categoryId: categoryId,
            updatedAt: Date.now(),
          });
        }
      } else {
        prompts.push({
          id: PromptUtils.generateId("p"),
          title: title,
          content: content,
          tags: tags,
          categoryId: categoryId,
          pinned: false,
          usageCount: 0,
          isPreset: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
      STORAGE.set({ prompts: prompts }, callback);
    });
  }

  function deletePrompt(id, callback) {
    STORAGE.get({ prompts: [] }, function (data) {
      var prompts = (data.prompts || []).filter(function (p) {
        return p.id !== id;
      });
      STORAGE.set({ prompts: prompts }, callback);
    });
  }

  function deletePrompts(ids, callback) {
    var idSet = new Set(ids);
    STORAGE.get({ prompts: [] }, function (data) {
      var prompts = (data.prompts || []).filter(function (p) {
        return !idSet.has(p.id);
      });
      STORAGE.set({ prompts: prompts }, callback);
    });
  }

  function togglePin(id, callback) {
    STORAGE.get({ prompts: [] }, function (data) {
      var prompts = data.prompts || [];
      var idx = prompts.findIndex(function (p) {
        return p.id === id;
      });
      if (idx !== -1) {
        prompts[idx].pinned = !prompts[idx].pinned;
        prompts[idx].updatedAt = Date.now();
        STORAGE.set({ prompts: prompts }, callback);
      }
    });
  }

  function duplicatePrompt(id, callback) {
    STORAGE.get({ prompts: [] }, function (data) {
      var prompts = data.prompts || [];
      var original = prompts.find(function (p) {
        return p.id === id;
      });
      if (!original) return;
      prompts.push({
        id: PromptUtils.generateId("p"),
        title: original.title + " (副本)",
        content: original.content,
        tags: original.tags ? original.tags.slice() : [],
        categoryId: original.categoryId,
        pinned: false,
        usageCount: 0,
        isPreset: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      STORAGE.set({ prompts: prompts }, callback);
    });
  }

  function incrementUsage(id, callback) {
    STORAGE.get({ prompts: [] }, function (data) {
      var prompts = data.prompts || [];
      var idx = prompts.findIndex(function (p) {
        return p.id === id;
      });
      if (idx !== -1) {
        prompts[idx].usageCount = (prompts[idx].usageCount || 0) + 1;
        prompts[idx].updatedAt = Date.now();
        STORAGE.set({ prompts: prompts }, callback);
      }
    });
  }

  function getRecentPrompts(count, callback) {
    STORAGE.get({ prompts: [] }, function (data) {
      var prompts = data.prompts || [];
      var used = prompts
        .filter(function (p) {
          return p.usageCount > 0;
        })
        .sort(function (a, b) {
          return (b.updatedAt || 0) - (a.updatedAt || 0);
        })
        .slice(0, count);
      callback(used);
    });
  }

  function getCategories(callback) {
    STORAGE.get({ categories: [] }, function (data) {
      callback(data.categories || []);
    });
  }

  function getCustomSites(callback) {
    STORAGE.get({ customSites: [] }, function (data) {
      callback(data.customSites || []);
    });
  }

  function saveCustomSite(site, callback) {
    getCustomSites(function (sites) {
      var index = sites.findIndex(function (item) {
        return item.id === site.id;
      });
      if (index === -1) sites.push(site);
      else sites[index] = site;
      STORAGE.set({ customSites: sites }, function () {
        if (callback) callback(sites);
      });
    });
  }

  function deleteCustomSite(id, callback) {
    getCustomSites(function (sites) {
      STORAGE.set(
        {
          customSites: sites.filter(function (site) {
            return site.id !== id;
          }),
        },
        function () {
          if (callback) callback();
        },
      );
    });
  }

  function addCategory(icon, name, callback) {
    STORAGE.get({ categories: [] }, function (data) {
      var categories = data.categories || [];
      var maxOrder = categories.reduce(function (max, c) {
        return Math.max(max, c.order || 0);
      }, 0);
      categories.push({
        id: PromptUtils.generateId("cat"),
        name: name,
        icon: icon,
        order: maxOrder + 1,
        isPreset: false,
        createdAt: Date.now(),
      });
      STORAGE.set({ categories: categories }, function () {
        callback(categories);
      });
    });
  }

  function deleteCategory(catId, callback) {
    STORAGE.get({ categories: [], prompts: [] }, function (data) {
      var categories = (data.categories || []).filter(function (c) {
        return c.id !== catId;
      });
      var prompts = (data.prompts || []).map(function (p) {
        if (p.categoryId === catId) {
          return Object.assign({}, p, { categoryId: "cat_custom" });
        }
        return p;
      });
      STORAGE.set({ categories: categories, prompts: prompts }, function () {
        callback(categories);
      });
    });
  }

  function saveSortSetting(sortBy, callback) {
    STORAGE.set({ sortBy: sortBy }, callback);
  }

  function saveCategoryOrder(orderedIds, callback) {
    STORAGE.get({ categories: [] }, function (data) {
      var categories = data.categories || [];
      var orderMap = {};
      orderedIds.forEach(function (id, index) {
        orderMap[id] = index + 1;
      });
      categories.forEach(function (cat) {
        if (orderMap[cat.id] !== undefined) {
          cat.order = orderMap[cat.id];
        }
      });
      STORAGE.set({ categories: categories }, function () {
        callback(categories);
      });
    });
  }

  function savePromptOrder(orderedIds, categoryId, callback) {
    STORAGE.get({ promptOrder: {} }, function (data) {
      var order = data.promptOrder || {};
      order[categoryId || "all"] = orderedIds;
      STORAGE.set({ promptOrder: order, sortBy: "custom" }, function () {
        if (callback) callback();
      });
    });
  }

  function getThemePreference(callback) {
    STORAGE.get({ theme: "dark" }, function (data) {
      callback(data.theme);
    });
  }

  function saveThemePreference(theme, callback) {
    STORAGE.set({ theme: theme }, callback);
  }

  function getViewMode(callback) {
    STORAGE.get({ viewMode: "list" }, function (data) {
      callback(data.viewMode);
    });
  }

  function saveViewMode(mode, callback) {
    STORAGE.set({ viewMode: mode }, callback);
  }

  function exportData() {
    STORAGE.get(
      { categories: [], prompts: [], sortBy: "updatedAt", sortOrder: "desc" },
      function (data) {
        var json = JSON.stringify(
          {
            version: 2,
            exportedAt: new Date().toISOString(),
            categories: data.categories,
            prompts: data.prompts,
            settings: { sortBy: data.sortBy, sortOrder: data.sortOrder },
          },
          null,
          2,
        );
        var blob = new Blob([json], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download =
          "prompt-injector-backup-" +
          new Date().toISOString().slice(0, 10) +
          ".json";
        a.click();
        URL.revokeObjectURL(url);
      },
    );
  }

  function exportSelectedData(ids) {
    STORAGE.get({ categories: [], prompts: [] }, function (data) {
      var idSet = new Set(ids);
      var selectedPrompts = (data.prompts || []).filter(function (p) {
        return idSet.has(p.id);
      });
      var usedCatIds = new Set(
        selectedPrompts.map(function (p) {
          return p.categoryId;
        }),
      );
      var selectedCats = (data.categories || []).filter(function (c) {
        return usedCatIds.has(c.id);
      });
      var json = JSON.stringify(
        {
          version: 2,
          exportedAt: new Date().toISOString(),
          categories: selectedCats,
          prompts: selectedPrompts,
        },
        null,
        2,
      );
      var blob = new Blob([json], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download =
        "prompt-injector-export-" +
        new Date().toISOString().slice(0, 10) +
        ".json";
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function importData(file, callback) {
    var reader = new FileReader();
    reader.onload = function (ev) {
      try {
        var data = JSON.parse(ev.target.result);
        if (!data.prompts || !data.categories) {
          callback(new Error("无效的备份文件"), null);
          return;
        }
        STORAGE.get({ categories: [], prompts: [] }, function (existing) {
          var existingPrompts = existing.prompts || [];
          var existingCats = existing.categories || [];
          var existingCatIds = new Set(
            existingCats.map(function (c) {
              return c.id;
            }),
          );
          var existingPromptIds = new Set(
            existingPrompts.map(function (p) {
              return p.id;
            }),
          );

          var newCats = data.categories.filter(function (c) {
            return !existingCatIds.has(c.id);
          });
          var newPrompts = data.prompts.filter(function (p) {
            return !existingPromptIds.has(p.id);
          });

          var mergedCats = existingCats.concat(newCats);
          var mergedPrompts = existingPrompts.concat(newPrompts);

          STORAGE.set(
            { categories: mergedCats, prompts: mergedPrompts },
            function () {
              callback(null, {
                categories: mergedCats,
                prompts: mergedPrompts,
                newCatCount: newCats.length,
                newPromptCount: newPrompts.length,
              });
            },
          );
        });
      } catch (err) {
        callback(err, null);
      }
    };
    reader.readAsText(file);
  }

  function resetPresets(callback) {
    STORAGE.get({ categories: [], prompts: [] }, function (data) {
      var existingCatIds = new Set(
        (data.categories || []).map(function (c) {
          return c.id;
        }),
      );
      var existingPromptIds = new Set(
        (data.prompts || []).map(function (p) {
          return p.id;
        }),
      );

      var presetCats = PromptDefaults.CATEGORIES.filter(function (c) {
        return !existingCatIds.has(c.id);
      });
      var presetPrompts = PromptDefaults.PROMPTS.filter(function (p) {
        return !existingPromptIds.has(p.id);
      });

      var mergedCats = (data.categories || []).concat(presetCats);
      var mergedPrompts = (data.prompts || []).concat(presetPrompts);

      STORAGE.set(
        { categories: mergedCats, prompts: mergedPrompts },
        function () {
          callback(mergedCats, mergedPrompts);
        },
      );
    });
  }

  return {
    loadData: loadData,
    getPrompts: getPrompts,
    savePrompt: savePrompt,
    deletePrompt: deletePrompt,
    deletePrompts: deletePrompts,
    togglePin: togglePin,
    duplicatePrompt: duplicatePrompt,
    incrementUsage: incrementUsage,
    getRecentPrompt: getRecentPrompts,
    getCategories: getCategories,
    getCustomSites: getCustomSites,
    saveCustomSite: saveCustomSite,
    deleteCustomSite: deleteCustomSite,
    addCategory: addCategory,
    deleteCategory: deleteCategory,
    saveSortSetting: saveSortSetting,
    saveCategoryOrder: saveCategoryOrder,
    savePromptOrder: savePromptOrder,
    getThemePreference: getThemePreference,
    saveThemePreference: saveThemePreference,
    getViewMode: getViewMode,
    saveViewMode: saveViewMode,
    exportData: exportData,
    exportSelectedData: exportSelectedData,
    importData: importData,
    resetPresets: resetPresets,
  };
})();
