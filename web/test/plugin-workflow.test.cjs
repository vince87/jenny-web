"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path"),
  http = require("node:http");
const { analyze } = require("../public/plugin-intent.js");
const { plan, GitHub } = require("../github.cjs");
const { Extensions } = require("../extensions.cjs");
const { createApp } = require("../server.cjs");
const { prepareTurn } = require("../turn-input.cjs");
async function folder(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "jenny-plugins-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}
test("Plugin mentions and search intent distinguish web from local code and GitHub", () => {
  for (const text of [
    "cerca il prezzo di young yng",
    "@web prezzo di young yng",
    "puoi cercare le ultime notizie",
    "search current news",
  ])
    assert.equal(analyze(text).webSearch, true, text);
  for (const text of [
    "non cercare su internet",
    "cerca nel codice la funzione",
    "@github cerca issue aperte",
    "spiega questo codice",
    "cerca nel workspace",
  ])
    assert.equal(analyze(text).webSearch, false, text);
  assert.deepEqual(analyze("@GitHub @mcp leggi").mentions, ["github", "mcp"]);
  assert.equal(analyze("@web cerca online").query, "cerca online");
});
test("GitHub plans restrict repository, operations, paths, scopes and file revisions", async () => {
  const config = {
    repository: "owner/project",
    token: "test-only",
    writeEnabled: false,
  };
  const args = {
    repository: config.repository,
    action: "put_file",
    parameters: {
      path: "src/a.js",
      branch: "feature/test",
      content: "hello",
      message: "Update",
      sha: "a".repeat(40),
    },
  };
  assert.throws(() => plan(config, args, true), /scrittura/);
  config.writeEnabled = true;
  const request = plan(config, args, true);
  assert.equal(request.method, "PUT");
  assert.equal(request.body.sha, "a".repeat(40));
  assert.equal(Buffer.from(request.body.content, "base64").toString(), "hello");
  assert.throws(
    () => plan(config, { ...args, repository: "other/repo" }, true),
    /diverso/,
  );
  for (const file of [
    "../a",
    "/etc/passwd",
    ".github/workflows/test.yml",
    "a/../../b",
  ])
    assert.throws(() =>
      plan(
        config,
        { ...args, parameters: { ...args.parameters, path: file } },
        true,
      ),
    );
  assert.throws(() => plan(config, { ...args, action: "delete" }, true));
  assert.throws(() =>
    plan(
      config,
      { ...args, parameters: { ...args.parameters, force: true } },
      true,
    ),
  );
  assert.throws(() =>
    plan(config, { ...args, action: "repo", parameters: {} }, true),
  );
  let calls = 0;
  const client = new GitHub(config, async (r) => {
    calls++;
    assert.equal(r.method, "PUT");
    throw Error("conflict");
  });
  await assert.rejects(client.execute(args, true), /conflict/);
  assert.equal(calls, 1);
  const reader = new GitHub(config, async () => ({
    type: "file",
    encoding: "base64",
    content: Buffer.from("hello").toString("base64"),
    sha: "a".repeat(40),
    size: 5,
    path: "a",
  }));
  assert.equal(
    (
      await reader.execute(
        { ...args, action: "files", parameters: { path: "a" } },
        false,
      )
    ).content,
    "hello",
  );
});
test("GitHub credentials and write grants are private, persistent and revocable", async (t) => {
  const dir = await folder(t),
    ext = new Extensions(dir, null, {});
  ext.install({
    kind: "github",
    repository: "owner/project",
    token: "private-test-token",
    confirmed: true,
  });
  assert.equal(ext.available("github_read"), true);
  assert.equal(ext.available("github_write"), false);
  assert.ok(!JSON.stringify(ext.list()).includes("private-test-token"));
  assert.equal(new Extensions(dir, null, {}).available("github_read"), true);
  ext.manage({ id: "github", action: "disable" });
  assert.equal(ext.available("github_read"), false);
  assert.throws(() =>
    ext.validate("github_read", {
      repository: "owner/project",
      action: "repo",
      parameters: {},
    }),
  );
  const prompt = require("../plugin-prompts.cjs").instructions(
    [{ kind: "github", enabled: true }],
    ["github"],
  );
  assert.match(prompt, /SHA/);
  assert.match(prompt, /github_write/);
  assert.match(prompt, /explicitly selected/);
});
test("Explicit web chat searches before a text-only model and records real sources", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "jenny-web-chat-")),
    requests = [];
  const search = http.createServer((req, res) => {
    requests.push(req.url);
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        results: [
          {
            title: "Source",
            url: "https://example.org/quote",
            content: "reference result",
          },
        ],
      }),
    );
  });
  await new Promise((r) => search.listen(0, "127.0.0.1", r));
  const app = await createApp({
    legacyAuth: true,
    dataDir: dir,
    workspaceRoot: path.join(dir, "workspaces"),
    provider: "openai",
    model: "fixture",
  });
  t.after(async () => {
    await app.close();
    search.closeAllConnections();
    await new Promise((r) => search.close(r));
    await fs.rm(dir, { recursive: true, force: true });
  });
  app.extensions.search = new (require("../search.cjs").SearchConfig)({
    WEB_SEARCH_PROVIDER: "searxng",
    SEARXNG_BASE_URL: "http://127.0.0.1:" + search.address().port,
    SEARXNG_ALLOW_PRIVATE: "true",
  });
  const s = app.agent.get(app.agent.create("principale").id),
    body = { content: "cerca il prezzo di young yng" };
  await assert.rejects(prepareTurn(app.agent, s, body), /Conferma/);
  await assert.rejects(
    prepareTurn(app.agent, s, { ...body, webConfirmed: true }),
    /Attiva/,
  );
  app.extensions.install({ kind: "web", confirmed: true });
  let modelCalls = 0;
  app.agent.provider.generate = async (payload) => {
    modelCalls++;
    assert.equal(requests.length, 1);
    assert.equal(payload.tools, undefined);
    assert.match(
      JSON.stringify(payload.messages),
      /https:\/\/example.org\/quote/,
    );
    assert.match(payload.messages[0].content, /WEB PLUGIN/);
    return {
      choices: [
        { message: { role: "assistant", content: "Source verified." } },
      ],
    };
  };
  const input = await prepareTurn(app.agent, s, {
    ...body,
    webConfirmed: true,
  });
  app.agent.send(s, input.content, "fixture", true, "it", input);
  while (app.agent.controllers.size)
    await new Promise((r) => setTimeout(r, 10));
  assert.equal(s.status, "idle", s.error);
  assert.equal(modelCalls, 1);
  assert.equal(s.webSources[0].url, "https://example.org/quote");
  assert.equal(s.events.at(-1).name, "web_search");
  assert.equal((await app.extensions.check("web", true)).ok, true);
  const check = app.extensions.list().installed[0].lastCheck;
  assert.equal(check.ok, true);
});
test("MCP negotiates older HTTP versions and exposes discoverable tool schemas", async (t) => {
  const dir = await folder(t);
  const versions = [];
  const server = http.createServer(async (req, res) => {
    if (req.method === "DELETE") {
      res.writeHead(204);
      return res.end();
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    versions.push([body.method, req.headers["mcp-protocol-version"]]);
    if (body.method === "notifications/initialized") {
      res.writeHead(202);
      return res.end();
    }
    res.setHeader("Content-Type", "application/json");
    const result =
      body.method === "initialize"
        ? {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "test", version: "1" },
          }
        : body.method === "tools/list"
          ? {
              tools: [
                {
                  name: "echo",
                  inputSchema: {
                    type: "object",
                    properties: { text: { type: "string" } },
                  },
                },
              ],
            }
          : { content: [{ type: "text", text: "ok" }] };
    res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const ext = new Extensions(dir, null, {});
  const id = ext.install({
    kind: "mcp",
    name: "local-test",
    url: "http://127.0.0.1:" + server.address().port,
    privateNetwork: true,
    confirmed: true,
  }).installed[0].id;
  const result = await ext.check(id, true);
  assert.equal(result.ok, true);
  assert.equal(result.tools[0].name, "echo");
  assert.equal(versions.find((x) => x[0] === "tools/list")[1], "2025-06-18");
  assert.ok(
    (
      await ext.execute(
        "mcp_call",
        { plugin: id, tool: "echo", arguments: { text: "hi" } },
        "",
      )
    ).result.includes("ok"),
  );
});
