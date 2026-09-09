const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "../public");
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, "locales.json"), "utf8"),
);
const runtime = fs.readFileSync(
  path.join(__dirname, "i18n-runtime.txt"),
  "utf8",
);
fs.writeFileSync(
  path.join(root, "i18n.js"),
  runtime.replace("/*CATALOG*/", JSON.stringify(catalog)),
);
