"use strict";
const fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { execFile } = require("node:child_process"),
  { promisify } = require("node:util");
const { execute, dockerArgs } = require("./runner-worker.cjs");
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "jenny-lab-smoke-"));
  const job = {
    workspace: "sample",
    recipe: "sandbox",
    command:
      "python3 -m venv .venv && .venv/bin/python -c 'print(42)' && node -v && gh --version && printf persistent > marker",
  };
  const volume = dockerArgs(root, job, "probe")
    .find((x) => x.startsWith("type=volume"))
    .split("src=")[1]
    .split(",")[0];
  try {
    await fs.mkdir(path.join(root, "sample"), { mode: 0o755 });
    const first = await execute(root, job);
    assert.equal(first.ok, true, first.output);
    assert.match(first.output, /42/);
    const second = await execute(root, {
      ...job,
      command:
        "test -f marker && test -x .venv/bin/python && test ! -e /source/marker && node -e 'if(Object.values(require(\"os\").networkInterfaces()).flat().some(x=>!x.internal))process.exit(1)' && echo LAB_PERSISTENCE_OK",
    });
    assert.equal(second.ok, true, second.output);
    assert.match(second.output, /LAB_PERSISTENCE_OK/);
    console.log(
      "LAB_PERSISTENCE_OK: Python venv, Node, gh, offline persistent copy; originals untouched.",
    );
  } finally {
    if (!/^jenny-lab-[a-f0-9]{32}$/.test(volume))
      throw Error("Invalid test volume");
    await promisify(execFile)("docker", ["volume", "rm", volume]).catch(
      () => {},
    );
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
