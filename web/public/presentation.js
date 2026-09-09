/* Pure, bounded presentation helpers. No HTML from files or LLMs is trusted. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JennyView = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const escape = (text) =>
    String(text).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  function highlight(text) {
    const pattern =
      /(\/\/[^\n]*|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:const|let|var|function|return|if|else|async|await|class|import|from|export|def|for|while|try|catch|true|false|null|None|True|False|self|new|throw)\b|\b\d+(?:\.\d+)?\b)/g;
    let output = "",
      last = 0;
    for (const m of text.matchAll(pattern)) {
      output += escape(text.slice(last, m.index));
      const token = m[0];
      const kind = /^(\/\/|#)/.test(token)
        ? "comment"
        : /^["'`]/.test(token)
          ? "string"
          : /^\d/.test(token)
            ? "number"
            : "keyword";
      output +=
        '<span class="syntax-' + kind + '">' + escape(token) + "</span>";
      last = m.index + token.length;
    }
    return output + escape(text.slice(last));
  }
  function diff(before, after) {
    const a = (before ?? "").split("\n"),
      b = after.split("\n");
    if (before === null) return b.map((text) => ({ kind: "add", text }));
    let prefix = 0,
      suffix = 0;
    while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix])
      prefix++;
    while (
      suffix < a.length - prefix &&
      suffix < b.length - prefix &&
      a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
    )
      suffix++;
    const x = a.slice(prefix, a.length - suffix),
      y = b.slice(prefix, b.length - suffix),
      rows = [];
    for (const text of a.slice(0, prefix)) rows.push({ kind: "same", text });
    // Keep memory bounded for huge files; the fallback is an exact replacement.
    if (x.length * y.length > 200000) {
      for (const text of x) rows.push({ kind: "remove", text });
      for (const text of y) rows.push({ kind: "add", text });
    } else {
      const table = Array.from(
        { length: x.length + 1 },
        () => new Uint32Array(y.length + 1),
      );
      for (let i = x.length - 1; i >= 0; i--)
        for (let j = y.length - 1; j >= 0; j--)
          table[i][j] =
            x[i] === y[j]
              ? table[i + 1][j + 1] + 1
              : Math.max(table[i + 1][j], table[i][j + 1]);
      let i = 0,
        j = 0;
      while (i < x.length || j < y.length) {
        if (i < x.length && j < y.length && x[i] === y[j]) {
          rows.push({ kind: "same", text: x[i++] });
          j++;
        } else if (
          j < y.length &&
          (i === x.length || table[i][j + 1] > table[i + 1][j])
        )
          rows.push({ kind: "add", text: y[j++] });
        else rows.push({ kind: "remove", text: x[i++] });
      }
    }
    for (const text of a.slice(a.length - suffix))
      rows.push({ kind: "same", text });
    return rows;
  }
  return { escape, highlight, diff };
});
