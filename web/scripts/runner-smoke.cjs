"use strict";
// Explicit Docker smoke test, separate from the dependency-free unit suite.
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict");
const { execute } = require("./runner-worker.cjs");
async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "jenny-runner-smoke-"));
  try {
    const workspace = path.join(root, "sample");
    await fs.mkdir(workspace, { mode: 0o755 });
    await fs.writeFile(
      path.join(workspace, "probe.cjs"),
      `
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os');
assert.equal(process.getuid(),1000);
assert.ok(Object.values(os.networkInterfaces()).flat().every(x=>x.internal));
assert.throws(()=>fs.writeFileSync('/source/forbidden','x'));
assert.throws(()=>fs.writeFileSync('/root-write-test','x'));
fs.writeFileSync('temporary-output','ok');
console.log('ISOLATED_TERMINAL_OK');
`,
    );
    const result = await execute(await fs.realpath(root), {
      workspace: "sample",
      recipe: "terminal",
      command: "node probe.cjs",
    });
    assert.equal(result.ok, true, result.output);
    assert.match(result.output, /ISOLATED_TERMINAL_OK/);
    await assert.rejects(fs.access(path.join(workspace, "temporary-output")));
    console.log(
      "Docker terminal: non-root, offline, read-only source and temporary writes verified.",
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
