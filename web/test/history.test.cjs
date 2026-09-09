const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Workspaces } = require("../workspaces.cjs");
test("History: retention, restart, isolation and conflict-safe restoration", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "jenny-history-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const w = new Workspaces(
    path.join(root, "workspaces"),
    path.join(root, "history"),
  );
  await w.init();
  await w.create("one");
  await w.create("two");
  let current = await w.write("one", "a.txt", "original", null);
  assert.equal((await w.history("one", "a.txt")).versions.length, 0);
  for (let i = 0; i < 35; i++)
    current = await w.write("one", "a.txt", String(i), current.revision);
  const versions = (await w.history("one", "a.txt")).versions;
  assert.equal(versions.length, 30);
  assert.equal((await w.history("two", "a.txt")).versions.length, 0);
  const again = new Workspaces(w.root, w.historyRoot);
  await again.init();
  const old = await again.history("one", "a.txt", versions[0].id);
  assert.notEqual(old.content, current.content);
  await assert.rejects(w.history("one", "a.txt", "../../escape"));
  await assert.rejects(w.history("one", "../escape"));
  await w.write("one", "a.txt", "external", current.revision);
  await assert.rejects(
    w.write("one", "a.txt", old.content, current.revision),
    /Conflitto/,
  );
  assert.equal((await w.read("one", "a.txt")).content, "external");
  const fresh = await w.read("one", "a.txt");
  await w.write("one", "a.txt", old.content, fresh.revision);
  assert.equal((await w.read("one", "a.txt")).content, old.content);
});
