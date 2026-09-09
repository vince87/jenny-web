"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  http = require("node:http");
const fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const { SearchConfig } = require("../search.cjs"),
  { Extensions } = require("../extensions.cjs");
async function fixture(t, respond) {
  const calls = [];
  const server = http.createServer((req, res) => {
    calls.push(req.url);
    respond(req, res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  return {
    calls,
    env: {
      WEB_SEARCH_PROVIDER: "searxng",
      SEARXNG_BASE_URL:
        "http://127.0.0.1:" + server.address().port + "/engine/",
      SEARXNG_ALLOW_PRIVATE: "true",
    },
  };
}
test("SearXNG env: fixed endpoint, encoded query, bounded results and no Brave fallback", async (t) => {
  const { calls, env } = await fixture(t, (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        results: [
          { url: "javascript:alert(1)" },
          { url: "https://user:secret@example.org" },
          ...Array.from({ length: 9 }, (_, i) => ({
            url: "https://example.org/" + i,
            title: "<b>Title</b>",
            content: "x".repeat(3000),
          })),
        ],
      }),
    );
  });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "jenny-search-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const ext = new Extensions(
    dir,
    {},
    { ...env, BRAVE_SEARCH_API_KEY: "env-secret" },
  );
  ext.install({ kind: "web", confirmed: true });
  ext.configureWeb({ token: "legacy-brave-secret", confirmed: true });
  const result = await ext.execute(
    "web_search",
    { query: "a & format=html / caffè" },
    "one",
  );
  assert.equal(result.provider, "searxng");
  assert.equal(result.links.length, 5);
  assert.equal(result.links[0].title, "Title");
  assert.equal(result.links[0].description.length, 1000);
  const url = new URL(calls[0], "http://localhost");
  assert.equal(url.pathname, "/engine/search");
  assert.equal(url.searchParams.get("format"), "json");
  assert.equal(url.searchParams.get("q"), "a & format=html / caffè");
  assert.equal(calls.length, 1);
  assert.ok(!JSON.stringify(ext.list()).includes("secret"));
  await assert.rejects(
    ext.execute("web_read", { url: env.SEARXNG_BASE_URL }, "one"),
    /blocked/,
  );
  ext.manage({ id: "web", action: "disable" });
  await assert.rejects(
    ext.execute("web_search", { query: "test" }, "one"),
    /disabled/,
  );
});
test("SearXNG requires private-network opt-in; rejects redirects without following them", async (t) => {
  const { calls, env } = await fixture(t, (req, res) => {
    res.writeHead(302, { Location: "http://127.0.0.1:1/" });
    res.end();
  });
  await assert.rejects(
    new SearchConfig({ ...env, SEARXNG_ALLOW_PRIVATE: "false" }).searxng(
      "test",
    ),
    /blocked/,
  );
  assert.equal(calls.length, 0);
  await assert.rejects(new SearchConfig(env).searxng("test"), /HTTP 302/);
  assert.equal(calls.length, 1);
});
test("SearXNG gives actionable JSON/403 errors and handles empty results", async (t) => {
  let mode = "403";
  const { env } = await fixture(t, (req, res) => {
    res.statusCode = mode === "403" ? 403 : 200;
    res.end(
      mode === "json"
        ? '{"results":[]}'
        : mode === "invalid"
          ? '{"wrong":[]}'
          : "<html>Search</html>",
    );
  });
  const config = new SearchConfig(env);
  await assert.rejects(config.searxng("test"), /search.formats/);
  mode = "html";
  await assert.rejects(config.searxng("test"), /did not return JSON/);
  mode = "invalid";
  await assert.rejects(config.searxng("test"), /Invalid SearXNG results/);
  mode = "json";
  assert.deepEqual((await config.searxng("test")).links, []);
});
test("Search environment validation and secret-free status", () => {
  for (const env of [
    { WEB_SEARCH_PROVIDER: "unknown" },
    { WEB_SEARCH_PROVIDER: "searxng" },
    { SEARXNG_ALLOW_PRIVATE: "yes" },
    { SEARXNG_BASE_URL: "file:///tmp" },
    { SEARXNG_BASE_URL: "https://user:pass@example.org" },
    { SEARXNG_BASE_URL: "https://example.org/?secret=x" },
  ])
    assert.throws(() => new SearchConfig(env));
  assert.equal(new SearchConfig({}).provider, "auto");
  assert.equal(
    new SearchConfig({ SEARXNG_BASE_URL: "https://example.org/" }).provider,
    "searxng",
  );
  assert.ok(
    !JSON.stringify(
      new SearchConfig({ BRAVE_SEARCH_API_KEY: "my-secret" }).view(),
    ).includes("my-secret"),
  );
});
