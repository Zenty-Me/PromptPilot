var PromptEditor = (function () {
  var currentTemplatePrompt = null;
  var categorySortable = null;

  function escapeHtml(str) {
    return PromptUtils.escapeHtml(str);
  }

  function clearValidation(elements) {
    elements.inputTitle.classList.remove("has-error");
    elements.inputContent.classList.remove("has-error");
    if (elements.errorTitle) elements.errorTitle.classList.add("hidden");
    if (elements.errorContent) elements.errorContent.classList.add("hidden");
  }

  function openEditor(prompt, categories, currentCategory, elements) {
    clearValidation(elements);
    if (prompt) {
      App.editingId = prompt.id;
      elements.editorTitle.textContent = "编辑提示词";
      elements.inputTitle.value = prompt.title;
      elements.inputContent.value = prompt.content;
      elements.inputTags.value = (prompt.tags || []).join(", ");
      PromptRender.populateCategorySelect(
        categories,
        prompt.categoryId,
        elements.inputCategory,
      );
      elements.btnDelete.classList.remove("hidden");
    } else {
      App.editingId = null;
      elements.editorTitle.textContent = "添加提示词";
      elements.inputTitle.value = "";
      elements.inputContent.value = "";
      elements.inputTags.value = "";
      var defaultCat =
        currentCategory !== "all"
          ? currentCategory
          : categories[0] && categories[0].id;
      PromptRender.populateCategorySelect(
        categories,
        defaultCat,
        elements.inputCategory,
      );
      elements.btnDelete.classList.add("hidden");
    }
    updateCharCount(elements);
    elements.editorOverlay.classList.remove("hidden");
    elements.inputTitle.focus();
  }

  function closeEditor(elements) {
    elements.editorOverlay.classList.add("hidden");
    clearValidation(elements);
    App.editingId = null;
  }

  function savePrompt(elements, onComplete) {
    var title = elements.inputTitle.value.trim();
    var content = elements.inputContent.value.trim();
    var tags = elements.inputTags.value
      .split(",")
      .map(function (t) {
        return t.trim();
      })
      .filter(Boolean);
    var categoryId = elements.inputCategory.value;

    var hasError = false;
    clearValidation(elements);

    if (!title) {
      elements.inputTitle.classList.add("has-error");
      if (elements.errorTitle) elements.errorTitle.classList.remove("hidden");
      hasError = true;
    }
    if (!content) {
      elements.inputContent.classList.add("has-error");
      if (elements.errorContent)
        elements.errorContent.classList.remove("hidden");
      hasError = true;
    }
    if (hasError) return;

    PromptStorage.savePrompt(
      App.editingId,
      title,
      content,
      tags,
      categoryId,
      function () {
        closeEditor(elements);
        if (onComplete) onComplete();
      },
    );
  }

  function insertVariable(elements) {
    var textarea = elements.inputContent;
    var start = textarea.selectionStart;
    var end = textarea.selectionEnd;
    var value = textarea.value;
    var selectedText = value.substring(start, end);
    var insertion = selectedText ? "{{" + selectedText + "}}" : "{{}}";
    textarea.value =
      value.substring(0, start) + insertion + value.substring(end);
    var cursorPos = selectedText ? start + insertion.length : start + 2;
    textarea.setSelectionRange(cursorPos, cursorPos);
    textarea.focus();
    updateCharCount(elements);
  }

  function updateCharCount(elements) {
    if (!elements.charCount) return;
    var len = (elements.inputContent.value || "").length;
    elements.charCount.textContent = len + " 字";
  }

  function openTemplateFill(prompt, elements) {
    currentTemplatePrompt = prompt;
    var variables = PromptUtils.extractVariables(prompt.content);
    elements.templateFields.innerHTML = variables
      .map(function (v) {
        return (
          '<div class="template-field">' +
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

    elements.templateFields.querySelectorAll("input").forEach(function (input) {
      input.addEventListener("input", function () {
        updateTemplatePreview(elements);
      });
    });

    updateTemplatePreview(elements);
    elements.templateOverlay.classList.remove("hidden");
    if (elements.templateFields.querySelector("input")) {
      elements.templateFields.querySelector("input").focus();
    }
  }

  function updateTemplatePreview(elements) {
    if (!currentTemplatePrompt) return;
    var values = {};
    elements.templateFields.querySelectorAll("input").forEach(function (input) {
      values[input.dataset.varName] = input.value;
    });
    var filled = PromptUtils.fillTemplate(
      currentTemplatePrompt.content,
      values,
    );
    elements.templatePreviewContent.innerHTML = highlightVariables(filled);
  }

  function highlightVariables(text) {
    var escaped = escapeHtml(text);
    return escaped.replace(
      /\{\{([^}]+)\}\}/g,
      '<span class="var-highlight">{{$1}}</span>',
    );
  }

  function closeTemplateFill(elements) {
    elements.templateOverlay.classList.add("hidden");
    currentTemplatePrompt = null;
  }

  function injectTemplate(elements, onInject) {
    if (!currentTemplatePrompt) return;
    var values = {};
    elements.templateFields.querySelectorAll("input").forEach(function (input) {
      values[input.dataset.varName] = input.value;
    });
    var filled = PromptUtils.fillTemplate(
      currentTemplatePrompt.content,
      values,
    );
    if (onInject) onInject(filled, currentTemplatePrompt.id);
    closeTemplateFill(elements);
  }

  function openSettings(elements, data) {
    elements.settingsSort.value = data.sortBy || "updatedAt";
    PromptRender.renderCategoryManageList(
      data.categories || [],
      elements.categoryList,
    );
    if (typeof Sortable !== "undefined" && elements.categoryList) {
      if (categorySortable) {
        categorySortable.destroy();
      }
      categorySortable = Sortable.create(elements.categoryList, {
        animation: 150,
        handle: ".cat-item-icon",
        filter: ".cat-item-delete",
        ghostClass: "sortable-ghost",
        onEnd: function () {
          var orderedIds = [];
          elements.categoryList
            .querySelectorAll("[data-cat-id]")
            .forEach(function (el) {
              orderedIds.push(el.dataset.catId);
            });
          PromptStorage.saveCategoryOrder(orderedIds, function () {});
        },
      });
    }
    elements.settingsOverlay.classList.remove("hidden");
  }

  function closeSettings(elements, onComplete) {
    elements.settingsOverlay.classList.add("hidden");
    if (categorySortable) {
      categorySortable.destroy();
      categorySortable = null;
    }
    if (onComplete) onComplete();
  }

  function addCategory(elements, onComplete) {
    var icon = elements.newCatIcon.value.trim() || "📁";
    var name = elements.newCatName.value.trim();
    if (!name) return;

    PromptStorage.addCategory(icon, name, function (categories) {
      elements.newCatIcon.value = "";
      elements.newCatName.value = "";
      PromptRender.renderCategoryManageList(categories, elements.categoryList);
      if (onComplete) onComplete();
    });
  }

  function deleteCategory(catId, elements, onComplete) {
    PromptStorage.deleteCategory(catId, function (categories) {
      PromptRender.renderCategoryManageList(categories, elements.categoryList);
      if (onComplete) onComplete();
    });
  }

  function handleImportFile(file, onComplete) {
    PromptStorage.importData(file, function (err, result) {
      if (err) {
        App.showToast("导入失败：" + err.message, "error");
        return;
      }
      App.showToast(
        "导入成功！新增 " +
          result.newCatCount +
          " 个分类，" +
          result.newPromptCount +
          " 条提示词",
        "success",
      );
      if (onComplete) onComplete(result);
    });
  }

  function resetPresets(onComplete) {
    PromptStorage.resetPresets(function (mergedCats, mergedPrompts) {
      App.showToast("预设数据已重置", "success");
      if (onComplete) onComplete(mergedCats, mergedPrompts);
    });
  }

  return {
    openEditor: openEditor,
    closeEditor: closeEditor,
    savePrompt: savePrompt,
    insertVariable: insertVariable,
    updateCharCount: updateCharCount,
    openTemplateFill: openTemplateFill,
    closeTemplateFill: closeTemplateFill,
    injectTemplate: injectTemplate,
    openSettings: openSettings,
    closeSettings: closeSettings,
    addCategory: addCategory,
    deleteCategory: deleteCategory,
    handleImportFile: handleImportFile,
    resetPresets: resetPresets,
  };
})();
