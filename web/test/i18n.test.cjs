"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { catalog, create, translate, apply } = require("../public/i18n.js");
test("IT/EN: cataloghi completi, fallback e scelta lingua esplicita", () => {
  assert.deepEqual(
    Object.keys(catalog.it).sort(),
    Object.keys(catalog.en).sort(),
  );
  for (const [key, value] of Object.entries(catalog.en)) {
    assert.ok(key.length && value.length);
    assert.equal(translate(key, "it"), key);
  }
  const i = create("it");
  assert.equal(i.t("Salva"), "Salva");
  i.set("en");
  assert.equal(i.t("Salva"), "Save");
  assert.equal(i.t("custom/file.js"), "custom/file.js");
  i.set("xx");
  assert.equal(i.language, "it");
});
test("Il runtime generato coincide con il catalogo canonico", () => {
  assert.deepEqual(
    catalog,
    JSON.parse(
      fs.readFileSync(path.join(__dirname, "../public/locales.json"), "utf8"),
    ),
  );
});
test("Markup: tutte le chiavi annotate e i riferimenti dinamici hanno traduzione", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "../public/index.html"),
    "utf8",
  );
  for (const match of html.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)) {
    const key = match[1]
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'");
    assert.ok(Object.hasOwn(catalog.en, key), key);
  }
  const app = fs
    .readdirSync(path.join(__dirname, "../public"))
    .filter((f) => f.endsWith(".js") && f !== "i18n.js")
    .map((f) => fs.readFileSync(path.join(__dirname, "../public", f), "utf8"))
    .join("\n");
  for (const m of app.matchAll(
    /\bt\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')\s*\)/g,
  )) {
    const key =
      m[1] !== undefined
        ? JSON.parse('"' + m[1] + '"')
        : m[2].replace(/\\'/g, "'");
    assert.ok(Object.hasOwn(catalog.en, key), key);
  }
});
test("Localizzazione esplicita: non riscrive contenuto di file o chat", () => {
  const label = { dataset: { i18n: "Salva" }, textContent: "Salva" };
  const userContent = { textContent: "Salva" };
  const doc = {
    documentElement: { lang: "it" },
    querySelectorAll(selector) {
      return selector === "[data-i18n]" ? [label] : [];
    },
  };
  apply(doc, create("en"));
  assert.equal(label.textContent, "Save");
  assert.equal(userContent.textContent, "Salva");
  assert.equal(doc.documentElement.lang, "en");
});
test("Bundle disponibile anche come script browser senza dipendenze", () => {
  const scope = {};
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../public/i18n.js"), "utf8"),
    scope,
  );
  assert.equal(scope.JennyI18n.create("en").t("Connetti"), "Connect");
});
