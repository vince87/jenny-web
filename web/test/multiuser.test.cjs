"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path"),
  http = require("node:http");
const { Accounts } = require("../auth/accounts.cjs");
const { createApp } = require("../server.cjs");
const { exportBundle, restoreBundle } = require("../backup.cjs");
const { dockerArgs } = require("../scripts/runner-worker.cjs");
const WORKER = "test-worker-credential-at-least-24-chars";
test("First deployment denies private access until explicit offline account setup", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "jenny-first-login-"));
  const app = await createApp({
    dataDir: path.join(dir, "data"),
    workspaceRoot: path.join(dir, "workspaces"),
  });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  const base = "http://127.0.0.1:" + app.server.address().port;
  const me = await fetch(base + "/api/auth/me");
  assert.equal(me.status, 401);
  assert.equal((await me.json()).setupRequired, true);
  assert.equal((await fetch(base + "/api/workspaces")).status, 401);
  assert.equal(app.accounts.allUsers().length, 0);
  assert.equal(app.runtimes.items.size, 0);
});
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "jenny-multi-"));
  const data = path.join(dir, "data"),
    root = path.join(dir, "workspaces");
  const llm = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/v1/models")
      return res.end(JSON.stringify({ data: [{ id: "fixture" }] }));
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    const query =
      body.messages.findLast((m) => m.role === "user")?.content || "";
    res.end(
      JSON.stringify({
        choices: [
          { message: { role: "assistant", content: "Reply: " + query } },
        ],
      }),
    );
  });
  await new Promise((r) => llm.listen(0, "127.0.0.1", r));
  const options = {
    dataDir: data,
    workspaceRoot: root,
    provider: "openai",
    baseURL: "http://127.0.0.1:" + llm.address().port + "/v1",
    model: "fixture",
    streaming: false,
    workerToken: WORKER,
  };
  // Actual legacy app creates a chat and file before account initialization.
  const old = await createApp({ ...options, legacyAuth: true });
  const legacyChat = old.agent.create("principale");
  await old.workspaces.write(
    "principale",
    "legacy.txt",
    "old-private-data",
    null,
  );
  old.agent.store.close();
  const accounts = new Accounts(data);
  const admin = await accounts.bootstrap("owner", "owner-password");
  accounts.close();
  let app = await createApp(options);
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  let base = "http://127.0.0.1:" + app.server.address().port;
  async function request(route, body, identity, extra = {}) {
    const response = await fetch(base + route, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(identity
          ? { Cookie: identity.cookie, "X-Jenny-CSRF": identity.csrf }
          : {}),
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      headers: response.headers,
      body: await response.json(),
    };
  }
  async function login(name, secret) {
    const response = await request("/api/auth/login", {
      username: name,
      password: secret,
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return {
      cookie: response.headers.get("set-cookie").split(";")[0],
      csrf: response.body.csrf,
      user: response.body.user,
    };
  }
  const a = await login("owner", "owner-password");
  const created = await request(
    "/api/auth/users",
    { username: "second", password: "second-password", role: "admin" },
    a,
  );
  assert.equal(created.status, 201);
  assert.equal(created.body.user.role, "user");
  const b = await login("second", "second-password");
  t.after(async () => {
    await app.close();
    llm.closeAllConnections();
    await new Promise((r) => llm.close(r));
    await fs.rm(dir, { recursive: true, force: true });
  });
  return {
    get app() {
      return app;
    },
    get base() {
      return base;
    },
    options,
    dir,
    data,
    root,
    a,
    b,
    admin,
    legacyChat,
    request,
    login,
    async restart() {
      await app.close();
      app = await createApp(options);
      await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
      base = "http://127.0.0.1:" + app.server.address().port;
    },
  };
}

test("Multi-user HTTP: login, CSRF, ownership of files/chats/exports/plugins and worker separation", async (t) => {
  const x = await fixture(t),
    { a, b, request } = x;
  assert.equal((await request("/api/memory?workspace=principale")).status, 401);
  const savedMemory = await request(
    "/api/memory",
    {
      workspace: "principale",
      content: "Private project A",
      revision: null,
      enabled: true,
    },
    a,
  );
  assert.equal(savedMemory.status, 200);
  assert.equal(
    (await request("/api/memory?workspace=principale", undefined, b)).body
      .content,
    "",
  );
  assert.equal(
    (await request("/api/memory?workspace=principale", undefined, a)).body
      .content,
    "Private project A",
  );
  assert.notEqual(
    (
      await request(
        "/api/memory",
        {
          workspace: "principale",
          content: "stale",
          revision: null,
          enabled: true,
        },
        a,
      )
    ).status,
    200,
  );
  assert.notEqual(
    (
      await request(
        "/api/extensions/install",
        { kind: "sandbox", confirmed: true },
        b,
      )
    ).status,
    200,
  );
  assert.equal((await request("/api/config")).status, 401);
  assert.equal(
    (
      await request("/api/config", undefined, null, {
        Authorization: "Bearer " + WORKER,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request("/api/config", undefined, null, {
        Authorization: "Bearer legacy-token",
      })
    ).status,
    401,
  );
  const page = await fetch(x.base);
  assert.match(await page.text(), /loginForm/);
  const cookie = (
    await request("/api/auth/login", {
      username: "owner",
      password: "owner-password",
    })
  ).headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.equal(
    (await request("/api/workspaces", { name: "badcsrf" }, { ...a, csrf: "" }))
      .status,
    403,
  );
  assert.equal(
    (
      await request("/api/workspaces", { name: "foreign" }, a, {
        Origin: "https://evil.example",
      })
    ).status,
    403,
  );
  assert.equal((await request("/api/auth/users", undefined, b)).status, 403);
  assert.equal(
    (
      await request(
        "/api/auth/users",
        { username: "hacker", password: "hacker-password" },
        b,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/api/file?workspace=principale&path=legacy.txt",
        undefined,
        a,
      )
    ).body.content,
    "old-private-data",
  );
  assert.equal(
    (
      await request(
        "/api/file?workspace=principale&path=legacy.txt",
        undefined,
        b,
      )
    ).status,
    400,
  );
  assert.equal(
    (await request("/api/sessions/" + x.legacyChat.id, undefined, b)).status,
    400,
  );
  assert.ok(
    !(await request("/api/sessions", undefined, b)).body.sessions.length,
  );
  assert.ok(
    !(await request("/api/export-chats", undefined, b)).body.sessions.length,
  );
  assert.equal(
    (await request("/api/workspaces", undefined, a)).body.workspaces.includes(
      ".users",
    ),
    false,
  );
  assert.equal(
    (await request("/api/workspaces", { name: "same" }, a)).status,
    201,
  );
  assert.equal(
    (await request("/api/workspaces", { name: "same" }, b)).status,
    201,
  );
  await request(
    "/api/file",
    { workspace: "same", path: "note.txt", content: "A-only", revision: null },
    a,
  );
  await request(
    "/api/file",
    { workspace: "same", path: "note.txt", content: "B-only", revision: null },
    b,
  );
  assert.equal(
    (await request("/api/file?workspace=same&path=note.txt", undefined, a)).body
      .content,
    "A-only",
  );
  assert.equal(
    (await request("/api/file?workspace=same&path=note.txt", undefined, b)).body
      .content,
    "B-only",
  );
  for (const route of [
    "/api/files?workspace=../.users",
    "/api/file?workspace=same&path=../../accounts.sqlite",
    "/api/file-history?workspace=../.users&path=note.txt",
  ])
    assert.equal((await request(route, undefined, b)).status, 400);
  await request(
    "/api/instructions",
    { workspace: "same", content: "A-instructions", revision: null },
    a,
  );
  assert.equal(
    (await request("/api/instructions?workspace=same", undefined, b)).body
      .content,
    "",
  );
  const chatA = (await request("/api/sessions", { workspace: "same" }, a)).body;
  const chatB = (await request("/api/sessions", { workspace: "same" }, b)).body;
  assert.equal(
    (await request("/api/sessions/" + chatA.id + "/export", undefined, b))
      .status,
    400,
  );
  for (const action of ["rename", "archive", "message", "approval", "stop"])
    assert.equal(
      (
        await request(
          "/api/sessions/" + chatA.id + "/" + action,
          {
            title: "intrusion",
            content: "intrusion",
            archived: true,
            id: "x",
            allowed: true,
          },
          b,
        )
      ).status,
      400,
      action,
    );
  const deniedStream = await fetch(
    x.base + "/api/sessions/" + chatA.id + "/events",
    { headers: { Cookie: b.cookie } },
  );
  assert.equal(deniedStream.status, 400);
  await deniedStream.text();
  await request(
    "/api/sessions/" + chatA.id + "/message",
    { content: "A-secret", useTools: false },
    a,
  );
  await request(
    "/api/sessions/" + chatB.id + "/message",
    { content: "B-secret", useTools: false },
    b,
  );
  for (let n = 0; n < 100; n++) {
    if (
      (await request("/api/sessions/" + chatB.id, undefined, b)).body.status ===
      "idle"
    )
      break;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.ok(
    !JSON.stringify(
      (await request("/api/export-chats", undefined, b)).body,
    ).includes("A-secret"),
  );
  assert.equal(
    (
      await request(
        "/api/extensions/install",
        { kind: "web", confirmed: true },
        a,
      )
    ).status,
    201,
  );
  assert.equal(
    (await request("/api/extensions", undefined, b)).body.installed.length,
    0,
  );
  assert.equal(
    (
      await request(
        "/api/extensions/install",
        { kind: "terminal", confirmed: true },
        b,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/api/extensions/install",
        {
          kind: "mcp",
          name: "LAN",
          url: "http://127.0.0.1:10000",
          privateNetwork: true,
          confirmed: true,
        },
        b,
      )
    ).status,
    400,
  );
  const mcp = (
    await request(
      "/api/extensions/install",
      {
        kind: "mcp",
        name: "private",
        url: "https://example.org/mcp",
        token: "A-secret-token",
        confirmed: true,
      },
      a,
    )
  ).body.installed.find((p) => p.kind === "mcp");
  assert.ok(
    !JSON.stringify(
      (await request("/api/extensions", undefined, b)).body,
    ).includes(mcp.id),
  );
  assert.equal(
    (
      await request(
        "/api/extensions/manage",
        { id: mcp.id, action: "remove", confirmed: true },
        b,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/api/runner",
        { workspace: "same", recipe: "node-test", confirmed: true },
        b,
      )
    ).status,
    403,
  );
  const job = (
    await request(
      "/api/runner",
      { workspace: "same", recipe: "node-test", confirmed: true },
      a,
    )
  ).body;
  assert.equal((await request("/api/runner/claim", {}, a)).status, 403);
  const headers = { Authorization: "Bearer " + WORKER };
  const leased = (await request("/api/runner/claim", {}, null, headers)).body
    .job;
  assert.equal(leased.owner, a.user.id);
  assert.equal(leased.legacy, true);
  assert.equal(leased.id, job.id);
  assert.equal(
    (
      await request(
        "/api/runner/complete",
        { id: leased.id, owner: b.user.id, lease: leased.lease, ok: true },
        null,
        headers,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/api/runner/complete",
        { id: leased.id, owner: a.user.id, lease: leased.lease, ok: true },
        null,
        headers,
      )
    ).status,
    200,
  );
  const args = dockerArgs(
    x.root,
    { ...leased, owner: b.user.id, legacy: false },
    "test",
  );
  assert.ok(
    args.some((arg) => arg.includes(path.join(".users", b.user.id, "same"))),
  );
  assert.throws(() =>
    dockerArgs(x.root, { ...leased, owner: "../../escape" }, "test"),
  );
  assert.equal(
    (await x.app.runtimes.get(a.user)).agent.provider,
    (await x.app.runtimes.get(b.user)).agent.provider,
  );
});

test("Multi-user HTTP: logout, password changes, disabled accounts, restart and complete backup restore", async (t) => {
  const x = await fixture(t),
    { a, b, request } = x;
  assert.equal((await request("/api/auth/logout", {}, b)).status, 200);
  assert.equal((await request("/api/auth/me", undefined, b)).status, 401);
  const b2 = await x.login("second", "second-password");
  await request(
    "/api/auth/password",
    { currentPassword: "second-password", newPassword: "updated-password" },
    b2,
  );
  assert.equal((await request("/api/auth/me", undefined, b2)).status, 401);
  assert.equal(
    (
      await request("/api/auth/login", {
        username: "second",
        password: "second-password",
      })
    ).status,
    401,
  );
  const b3 = await x.login("second", "updated-password");
  await request(
    "/api/file",
    {
      workspace: "principale",
      path: "user.txt",
      content: "B-preserved",
      revision: null,
    },
    b3,
  );
  assert.equal(
    (
      await request(
        "/api/auth/users/disable",
        { id: b.user.id, disabled: true },
        a,
      )
    ).status,
    200,
  );
  assert.equal((await request("/api/auth/me", undefined, b3)).status, 401);
  assert.equal(
    (
      await request("/api/auth/login", {
        username: "second",
        password: "updated-password",
      })
    ).status,
    401,
  );
  await request(
    "/api/auth/users/disable",
    { id: b.user.id, disabled: false },
    a,
  );
  assert.equal((await request("/api/auth/me", undefined, b3)).status, 401);
  await x.restart();
  assert.equal((await request("/api/auth/me", undefined, a)).status, 401);
  const restoredB = await x.login("second", "updated-password");
  assert.equal(
    (
      await request(
        "/api/file?workspace=principale&path=user.txt",
        undefined,
        restoredB,
      )
    ).body.content,
    "B-preserved",
  );
  // Stop all writers before the offline snapshot.
  await x.app.close();
  const bundle = await exportBundle(x.data, x.root),
    destination = path.join(x.dir, "restored");
  await restoreBundle(bundle, destination);
  const restoredAccounts = new Accounts(path.join(destination, "data"));
  assert.equal(restoredAccounts.legacyOwner(), a.user.id);
  assert.equal(
    (await restoredAccounts.login("second", "updated-password")).user.id,
    b.user.id,
  );
  restoredAccounts.close();
  assert.equal(
    await fs.readFile(
      path.join(
        destination,
        "workspaces",
        ".users",
        b.user.id,
        "principale",
        "user.txt",
      ),
      "utf8",
    ),
    "B-preserved",
  );
  assert.equal(
    await fs.readFile(
      path.join(destination, "workspaces", "principale", "legacy.txt"),
      "utf8",
    ),
    "old-private-data",
  );
  // close() is intentionally idempotent for teardown and restart tooling.
});

test("Multi-user HTTP: revoked SSE ends before another update; disabled users lose pending work", async (t) => {
  const x = await fixture(t);
  const chat = (
    await x.request("/api/sessions", { workspace: "principale" }, x.b)
  ).body;
  const stream = await fetch(x.base + "/api/sessions/" + chat.id + "/events", {
    headers: { Cookie: x.b.cookie },
    signal: AbortSignal.timeout(5000),
  });
  const reader = stream.body.getReader();
  assert.match(
    new TextDecoder().decode((await reader.read()).value),
    /event: state/,
  );
  await x.request("/api/auth/logout", {}, x.b);
  const context = await x.app.runtimes.get(x.b.user);
  const s = context.agent.sessions.get(chat.id);
  s.title = "not-for-revoked-session";
  context.agent.save(s);
  assert.equal((await reader.read()).done, true);
  s.status = "waiting";
  s.pending = null;
  s.queue = [];
  context.agent.save(s);
  assert.equal(
    (
      await x.request(
        "/api/auth/users/disable",
        { id: x.b.user.id, disabled: true },
        x.a,
      )
    ).status,
    200,
  );
  assert.equal(s.status, "idle");
});

test("Multi-user HTTP: first setup is local only, login attempts bounded, cookie duplication refused", async (t) => {
  const x = await fixture(t);
  assert.equal(
    (
      await x.request("/api/auth/bootstrap", {
        username: "intruder",
        password: "intruder-password",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await x.request("/api/auth/me", undefined, null, {
        Cookie: x.a.cookie + "; " + x.b.cookie,
      })
    ).status,
    401,
  );
  for (let n = 0; n < 10; n++)
    assert.equal(
      (
        await x.request("/api/auth/login", {
          username: "owner",
          password: "bad",
        })
      ).status,
      401,
    );
  assert.equal(
    (
      await x.request("/api/auth/login", {
        username: "owner",
        password: "owner-password",
      })
    ).status,
    429,
  );
  const { AuthHTTP } = require("../auth/http.cjs");
  assert.match(
    new AuthHTTP(x.app.accounts, { secure: true }).cookie("test"),
    /; Secure$/,
  );
  const { execFile } = require("node:child_process");
  const { promisify } = require("node:util");
  await assert.rejects(
    promisify(execFile)(process.execPath, [
      path.join(__dirname, "../scripts/account.cjs"),
      "init",
      "owner",
      "--adopt-existing",
    ]),
    /interactive terminal/,
  );
});
