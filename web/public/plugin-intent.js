(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JennyPluginIntent = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function analyze(content) {
    const mentions = [
      ...new Set(
        [
          ...String(content).matchAll(/(?:^|\s)@(web|github|mcp|terminal)\b/gi),
        ].map((m) => m[1].toLowerCase()),
      ),
    ];
    const query = String(content)
      .replace(/(?:^|\s)@(web|github|mcp|terminal)\b/gi, " ")
      .trim();
    const explicit =
      /^(?:(?:per favore|please)\s+)?(?:cerca(?:mi)?|search(?: for)?|look up|puoi cercare|trova online|trova sul web|ricerca online)\b/i.test(
        query,
      );
    const local =
      /\b(?:file|codice|code|workspace|progetto|project|cartella|folder|repository|repo)\b/i.test(
        query,
      );
    const web =
      mentions.includes("web") ||
      (mentions.length === 0 &&
        explicit &&
        (!local || /\b(?:internet|online|web)\b/i.test(query)));
    return { mentions, query, webSearch: web };
  }
  return { analyze };
});
