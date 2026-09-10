"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const { research } = require("../web-plan.cjs");
const reply = (content) => ({
  choices: [{ message: { content: JSON.stringify(content) } }],
});
test("Research refines insufficient results, stops when adequate and never searches when disabled", async () => {
  const queries = [],
    phases = [];
  let calls = 0,
    enabled = true;
  const provider = {
    generate: async (body) => {
      calls++;
      if (calls === 2) assert.match(body.messages[1].content, /learned alias/);
      return reply(
        calls === 1
          ? { search: true, query: "pinco pallino" }
          : calls === 2
            ? { search: true, query: "pinco pallino learned alias" }
            : { search: false, query: "" },
      );
    },
  };
  const extensions = {
    available: () => enabled,
    execute: async (name, args) => {
      queries.push(args.query);
      return { text: "learned alias", links: [] };
    },
  };
  const s = {
    model: "fake",
    messages: [{ role: "user", content: "chi è pinco pallino oggi?" }],
    events: [],
  };
  const results = await research(
    provider,
    extensions,
    s,
    new AbortController().signal,
    (p) => phases.push(p),
  );
  assert.equal(results.length, 2);
  assert.equal(calls, 3);
  assert.notEqual(queries[0], queries[1]);
  assert.equal(s.messages[0].content, "chi è pinco pallino oggi?");
  enabled = false;
  await research(
    provider,
    extensions,
    s,
    new AbortController().signal,
    () => {},
  );
  assert.equal(calls, 3);
});
test("Research limits attempts and rejects repeated queries", async () => {
  let calls = 0;
  const ext = {
    available: () => true,
    execute: async () => ({ text: "none", links: [] }),
  };
  const s = { messages: [{ content: "@web cerca abc" }], events: [] };
  const p = {
    generate: async () => reply({ search: true, query: "q" + ++calls }),
  };
  assert.equal(
    (await research(p, ext, s, new AbortController().signal, () => {})).length,
    3,
  );
  p.generate = async () => reply({ search: true, query: "same" });
  assert.equal(
    (await research(p, ext, s, new AbortController().signal, () => {})).length,
    1,
  );
});
test("Compaction preserves transcript, persists project memory and protects user edits", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "jenny-memory-"));
  const { SessionStore } = require("../store.cjs"),
    { ProjectMemory, compact } = require("../memory.cjs");
  const store = new SessionStore(dir);
  t.after(async () => {
    store.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  const memory = new ProjectMemory(store);
  const s = { workspace: "a", model: "fake", messages: [] };
  for (let i = 0; i < 20; i++)
    s.messages.push(
      { role: "user", content: "Goal " + i + "x".repeat(700) },
      { role: "assistant", content: "Decision " + i + "y".repeat(700) },
    );
  s.messages.push({ role: "user", content: "continue" });
  const before = JSON.stringify(s.messages);
  const agent = {
    memory,
    save: () => {},
    provider: {
      generate: async () => ({
        choices: [{ message: { content: "Goal, decisions, pending tests." } }],
      }),
    },
  };
  const result = await compact(
    agent,
    s,
    { role: "system", content: "Assistant" },
    [],
    { context: 4096, predict: 1024 },
    new AbortController().signal,
  );
  assert.equal(JSON.stringify(s.messages), before);
  assert.ok(s.compaction.through > 0);
  assert.ok(result.messages.length < s.messages.length);
  assert.match(memory.get("a").content, /decisions/);
  assert.equal(memory.get("b").content, "");
  const old = memory.get("a");
  memory.set("a", "Manual", old.revision, false);
  assert.throws(() => memory.set("a", "stale", old.revision), /changed/);
  assert.equal(new ProjectMemory(store).get("a").enabled, false);
});
test("Lab jobs use private persistent volumes, read-only originals and no credentials", () => {
  const { dockerArgs } = require("../scripts/runner-worker.cjs");
  const a = dockerArgs(
    "/workspaces",
    { workspace: "one", recipe: "sandbox", command: "python3 -m venv .venv" },
    "test",
  );
  const b = dockerArgs(
    "/workspaces",
    { workspace: "two", recipe: "sandbox", command: "node --test" },
    "test",
  );
  assert.ok(a.includes("jenny-lab:local"));
  assert.ok(a.includes("--read-only"));
  assert.ok(a.includes("--network=none"));
  assert.ok(a.some((x) => x.includes("dst=/source,readonly")));
  assert.notEqual(
    a.find((x) => x.startsWith("type=volume")),
    b.find((x) => x.startsWith("type=volume")),
  );
  assert.ok(!a.join(" ").includes("docker.sock"));
  assert.ok(!a.join(" ").includes("GH_TOKEN"));
});
