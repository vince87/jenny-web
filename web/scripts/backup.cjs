#!/usr/bin/env node
"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { acquire, exportBundle, restoreBundle } = require("../backup.cjs");
async function main() {
  const [action, ...args] = process.argv.slice(2);
  if (action === "create" && args.length === 3) {
    const [data, workspaces, output] = args.map((p) => path.resolve(p));
    if (
      [data, workspaces].some(
        (root) => output === root || output.startsWith(root + path.sep),
      )
    )
      throw Error("Save backup outside source directories");
    const release = await acquire(data);
    try {
      const bytes = await exportBundle(data, workspaces);
      await fs.writeFile(output, bytes, { flag: "wx", mode: 0o600 });
      console.log(output);
    } finally {
      await release();
    }
  } else if (action === "restore" && args.length === 2) {
    const st = await fs.stat(args[0]);
    if (st.size > 256 * 1024 * 1024) throw Error("Backup too large");
    console.log(
      await restoreBundle(await fs.readFile(args[0]), path.resolve(args[1])),
    );
  } else
    throw Error(
      "Usage: node web/scripts/backup.cjs create DATA_DIR WORKSPACES_DIR OUTPUT.jenny.gz | restore INPUT.jenny.gz NEW_DIRECTORY",
    );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
