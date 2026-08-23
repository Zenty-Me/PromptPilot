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

  return {
    extractVariables: extractVariables,
    fillTemplate: fillTemplate,
    hasVariables: hasVariables,
    escapeHtml: escapeHtml,
    generateId: generateId,
  };
})();
