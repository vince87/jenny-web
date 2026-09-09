"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os"),
  http = require("node:http");
const { Extensions } = require("../extensions.cjs");
const { publicAddress, readPage } = require("../network.cjs");
const { MCP } = require("../mcp.cjs");
const { SessionStore } = require("../store.cjs");
const { RunnerQueue } = require("../runner.cjs");
const { dockerArgs } = require("../scripts/runner-worker.cjs");
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "jenny-ext-"));
  const store = new SessionStore(dir);
  const runner = new RunnerQueue(store);
  t.after(async () => {
    store.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  return { ext: new Extensions(dir, runner), runner, dir };
}
test("Plugin permissions survive restart; secrets never enter catalog; disable revokes execution", async (t) => {
  const { ext, runner, dir } = await fixture(t);
  assert.throws(() => ext.install({ kind: "web" }));
  ext.install({ kind: "web", confirmed: true });
  assert.equal(ext.schemas().length, 2);
  ext.configureWeb({ token: "search-test-secret", confirmed: true });
  assert.ok(!JSON.stringify(ext.list()).includes("search-test-secret"));
  assert.throws(() => ext.configureWeb({ token: "bad\nkey", confirmed: true }));
  ext.manage({ id: "web", action: "disable" });
  assert.throws(() => ext.validate("web_read", { url: "https://example.org" }));
  assert.equal(new Extensions(dir, runner).schemas().length, 0);
  const result = ext.install({
    kind: "mcp",
    name: "test",
    url: "https://example.org/mcp",
    token: "test-secret",
    confirmed: true,
  });
  assert.ok(!JSON.stringify(result).includes("test-secret"));
  assert.ok(result.installed.at(-1).hasToken);
  assert.throws(() =>
    ext.install({
      kind: "mcp",
      name: "bad",
      url: "http://example.org/mcp",
      token: "secret",
      confirmed: true,
    }),
  );
  assert.throws(() => ext.manage({ id: "web", action: "remove" }));
  ext.manage({ id: "web", action: "remove", confirmed: true });
});
test("Web rejects private, encoded loopback, metadata and mapped IPv6 destinations", async () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "192.168.1.1",
    "::1",
    "::ffff:127.0.0.1",
    "fd00::1",
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("8.8.8.8"), true);
  for (const url of [
    "http://127.1/",
    "http://2130706433/",
    "http://[::ffff:127.0.0.1]/",
    "file:///etc/passwd",
  ])
    await assert.rejects(readPage(url));
});
test("Terminal jobs validate command, isolate workspace and use one-time completion", async (t) => {
  const { ext, runner } = await fixture(t);
  ext.install({ kind: "terminal", confirmed: true });
  const j = await ext.execute(
    "terminal_run",
    { command: "printf hello" },
    "one",
  );
  const args = dockerArgs("/workspaces", j, "test");
  assert.ok(args.includes("--network=none"));
  assert.ok(args.includes("--read-only"));
  assert.equal(args.at(-1), "printf hello");
  assert.throws(() =>
    dockerArgs("/workspaces", { ...j, workspace: "../escape" }, "test"),
  );
  const claimed = runner.claim();
  runner.complete(j.id, claimed.lease, { ok: true, output: "hello" });
  assert.throws(() => runner.complete(j.id, claimed.lease, { ok: true }));
  await assert.rejects(ext.execute("terminal_status", { id: j.id }, "other"));
  assert.equal(
    (await ext.execute("terminal_status", { id: j.id }, "one")).output,
    "hello",
  );
});
test("MCP initialization, session header, pagination and SSE tool call", async (t) => {
  const calls = [];
  const server = http.createServer(async (req, res) => {
    if (req.method === "DELETE") {
      assert.equal(req.headers["mcp-session-id"], "session");
      res.writeHead(204);
      return res.end();
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const b = JSON.parse(raw);
    calls.push(b);
    if (b.method !== "initialize")
      assert.equal(req.headers["mcp-session-id"], "session");
    if (b.method === "notifications/initialized") {
      res.writeHead(202);
      return res.end();
    }
    res.setHeader("Content-Type", "application/json");
    let result;
    if (b.method === "initialize") {
      res.setHeader("Mcp-Session-Id", "session");
      result = {
        protocolVersion: "2025-11-25",
        capabilities: { tools: {} },
        serverInfo: { name: "fixture", version: "1" },
      };
    }
    if (b.method === "tools/list")
      result = b.params.cursor
        ? { tools: [{ name: "second" }] }
        : { tools: [{ name: "first" }], nextCursor: "next" };
    if (b.method === "tools/call") {
      res.setHeader("Content-Type", "text/event-stream");
      res.write(
        "data: " +
          JSON.stringify({
            jsonrpc: "2.0",
            id: b.id,
            result: { content: [{ type: "text", text: "done" }] },
          }) +
          "\n\n",
      );
      return;
    }
    res.end(JSON.stringify({ jsonrpc: "2.0", id: b.id, result }));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const client = new MCP({
    url: "http://127.0.0.1:" + server.address().port,
    privateNetwork: true,
  });
  assert.equal((await client.list()).length, 2);
  assert.equal((await client.call("first", {})).content[0].text, "done");
  assert.ok(calls.some((c) => c.method === "notifications/initialized"));
  await client.close();
  assert.equal(client.session, null);
});

test("Activity shows immediate waiting, thinking and writing, then hides on completion", () => {
  const vm = require("node:vm"),
    syncFS = require("node:fs");
  const elements = {};
  const scope = {
    session: null,
    sending: true,
    $: (id) => (elements[id] ??= {}),
    t: (x) => x,
    setInterval: () => {},
  };
  vm.createContext(scope);
  vm.runInContext(
    syncFS.readFileSync(
      path.join(__dirname, "../public/activity-ui.js"),
      "utf8",
    ),
    scope,
  );
  scope.paintActivity();
  assert.equal(elements.activity.hidden, false);
  assert.match(elements.activityLabel.textContent, /In attesa/);
  scope.sending = false;
  scope.session = {
    status: "running",
    phase: "thinking",
    partialThinking: "A thought",
  };
  scope.paintActivity();
  assert.match(elements.activityLabel.textContent, /pensando/);
  assert.equal(elements.liveThinkingText.textContent, "A thought");
  scope.session.phase = "writing";
  scope.paintActivity();
  assert.match(elements.activityLabel.textContent, /scrivendo/);
  scope.session.status = "idle";
  scope.paintActivity();
  assert.equal(elements.activity.hidden, true);
});
