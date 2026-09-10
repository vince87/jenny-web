"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { createApp } = require("../server.cjs");
const TOKEN = "test-token-for-jenny-web-12345";
const listen = async (server) => {
  for (let attempt = 0; attempt < 20; attempt++) {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    // Some hosts allocate ephemeral ports on Fetch's forbidden-port list.
    const forbidden = new Set([
      1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77,
      79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123,
      135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530,
      531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995,
      1719, 1720, 1723, 2049, 3659, 4045, 5060, 5061, 6000, 6566, 6665, 6666,
      6667, 6668, 6669, 6679, 6697, 10080, 4190,
    ]);
    if (!forbidden.has(port)) return `http://127.0.0.1:${port}`;
    await new Promise((resolve) => server.close(resolve));
  }
  throw Error("Unable to allocate a Fetch-compatible test port.");
};
const close = (server) =>
  new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  });
async function setup(t, responder) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "jenny-web-test-"));
  const calls = [];
  const llm = http.createServer(async (req, res) => {
    if (req.url === "/v1/models") {
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ data: [{ id: "local-test" }] }));
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    calls.push(body);
    const result = await responder(body, calls.length);
    if (res.destroyed) return;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: result }] }));
  });
  const llmURL = await listen(llm);
  const options = {
    legacyAuth: true,
    provider: "openai",
    dataDir: path.join(dir, "data"),
    workspaceRoot: path.join(dir, "workspaces"),
    token: TOKEN,
    baseURL: llmURL + "/v1",
    model: "local-test",
    timeout: 3000,
  };
  const app = await createApp(options);
  const base = await listen(app.server);
  const api = async (route, body, headers = {}) => {
    const r = await fetch(base + route, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: "Bearer " + TOKEN,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, body: await r.json(), headers: r.headers };
  };
  const wait = async (id, status) => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const s = (await api("/api/sessions/" + id)).body;
      if (s.status === status) return s;
      if (s.status === "error" && status !== "error") assert.fail(s.error);
      await new Promise((r) => setTimeout(r, 15));
    }
    assert.fail("Timed out waiting for " + status);
  };
  t.after(async () => {
    for (const c of app.agent.controllers.values()) c.abort();
    await close(app.server);
    await close(llm);
    app.agent.store.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  const chat = async (content) => {
    const { body: s } = await api("/api/sessions", { workspace: "principale" });
    const sent = await api("/api/sessions/" + s.id + "/message", { content });
    assert.equal(sent.status, 202);
    return s.id;
  };
  return { app, api, wait, chat, dir, calls, options, base };
}
const tool = (name, args, id = "call-1") => ({
  id,
  type: "function",
  function: { name, arguments: JSON.stringify(args) },
});
const finish = { role: "assistant", content: "Operazione conclusa." };
test("Extensions HTTP requires authentication and confirmation; agent approval is single use and revocable", async (t) => {
  const x = await setup(t, async (_, n) =>
    n === 1
      ? {
          role: "assistant",
          tool_calls: [tool("terminal_run", { command: "printf test" })],
        }
      : finish,
  );
  assert.equal(
    (
      await x.api("/api/extensions", undefined, {
        Authorization: "Bearer invalid",
      })
    ).status,
    401,
  );
  assert.equal(
    (await x.api("/api/extensions/install", { kind: "terminal" })).status,
    400,
  );
  assert.equal(
    (
      await x.api("/api/extensions/install", {
        kind: "terminal",
        confirmed: true,
      })
    ).status,
    201,
  );
  const id = await x.chat("Run a command");
  const pending = await x.wait(id, "waiting");
  assert.equal(pending.pending.extension, "terminal_run");
  assert.equal((await x.api("/api/runner")).body.jobs.length, 0);
  await x.api("/api/extensions/manage", { id: "terminal", action: "disable" });
  await x.api("/api/sessions/" + id + "/approval", {
    id: pending.pending.id,
    allowed: true,
  });
  const done = await x.wait(id, "idle");
  assert.match(
    done.messages.find((m) => m.role === "tool").content,
    /disabled/,
  );
  assert.equal((await x.api("/api/runner")).body.jobs.length, 0);
  assert.equal(
    (
      await x.api("/api/sessions/" + id + "/approval", {
        id: pending.pending.id,
        allowed: true,
      })
    ).status,
    400,
  );
});
test("Extension rejection never creates a job", async (t) => {
  const x = await setup(t, async (_, n) =>
    n === 1
      ? {
          role: "assistant",
          tool_calls: [tool("terminal_run", { command: "printf test" })],
        }
      : finish,
  );
  await x.api("/api/extensions/install", { kind: "terminal", confirmed: true });
  const id = await x.chat("Run");
  const pending = await x.wait(id, "waiting");
  await x.api("/api/sessions/" + id + "/approval", {
    id: pending.pending.id,
    allowed: false,
  });
  await x.wait(id, "idle");
  assert.equal((await x.api("/api/runner")).body.jobs.length, 0);
});
test("HTTP: pagina reale, asset, health, autenticazione e origini", async (t) => {
  const x = await setup(t, async () => finish);
  const r = await fetch(x.base);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /File del progetto/);
  assert.match(
    r.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  for (const file of ["/app.js", "/style.css"])
    assert.equal((await fetch(x.base + file)).status, 200);
  assert.equal((await fetch(x.base + "/healthz")).status, 200);
  assert.equal(
    (await x.api("/api/workspaces", undefined, { Authorization: "" })).status,
    401,
  );
  assert.equal(
    (
      await x.api(
        "/api/workspaces",
        { name: "no" },
        { Origin: "https://evil.example" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await x.api(
        "/api/workspaces",
        { name: "no" },
        { "Content-Type": "text/plain" },
      )
    ).status,
    415,
  );
  assert.deepEqual((await x.api("/api/models")).body.models, ["local-test"]);
  assert.equal((await x.api("/api/config")).body.version, "0.9.0");
});
test("File: creazione, lettura, modifica, conflitto e separazione workspace", async (t) => {
  const { api } = await setup(t, async () => finish);
  const create = await api("/api/file", {
    workspace: "principale",
    path: "src/hello.js",
    content: "old",
    revision: null,
  });
  assert.equal(create.status, 200);
  assert.equal(
    (await api("/api/files?workspace=principale")).body.entries[0].name,
    "src",
  );
  const read = await api("/api/file?workspace=principale&path=src/hello.js");
  assert.equal(read.body.content, "old");
  assert.equal(
    (
      await api("/api/file", {
        workspace: "principale",
        path: "src/hello.js",
        content: "new",
        revision: read.body.revision,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await api("/api/file", {
        workspace: "principale",
        path: "src/hello.js",
        content: "stale",
        revision: read.body.revision,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await api("/api/file", {
        workspace: "principale",
        path: "src/hello.js",
        content: "overwrite",
        revision: null,
      })
    ).status,
    400,
  );
  await api("/api/workspaces", { name: "secondo" });
  assert.equal(
    (await api("/api/file?workspace=secondo&path=src/hello.js")).status,
    400,
  );
});
test("Confini filesystem: traversal, .git, symlink, binari, limite dimensioni", async (t) => {
  if (process.platform === "win32") {
    t.skip("POSIX symlinks: run in Linux Docker CI.");
    return;
  }
  const { api, dir } = await setup(t, async () => finish);
  await fs.writeFile(path.join(dir, "secret"), "segreto");
  await fs.symlink(
    path.join(dir, "secret"),
    path.join(dir, "workspaces/principale/link"),
  );
  await fs.symlink(dir, path.join(dir, "workspaces/alias"));
  for (const target of ["../secret", "/etc/passwd", ".git/config", "link"]) {
    assert.equal(
      (
        await api(
          "/api/file?workspace=principale&path=" + encodeURIComponent(target),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await api("/api/file", {
          workspace: "principale",
          path: target,
          content: "bad",
          revision: null,
        })
      ).status,
      400,
    );
  }
  assert.equal((await api("/api/files?workspace=alias")).status, 400);
  assert.equal(await fs.readFile(path.join(dir, "secret"), "utf8"), "segreto");
  await fs.writeFile(
    path.join(dir, "workspaces/principale/binary"),
    Buffer.from([0, 1, 2]),
  );
  assert.equal(
    (await api("/api/file?workspace=principale&path=binary")).status,
    400,
  );
  assert.equal(
    (
      await api("/api/file", {
        workspace: "principale",
        path: "large",
        content: "x".repeat(256 * 1024 + 1),
        revision: null,
      })
    ).status,
    400,
  );
});
test("Chat semplice e modalità senza tool", async (t) => {
  const x = await setup(t, async () => ({
    role: "assistant",
    content: "Ciao Vincenzo",
  }));
  const { body: s } = await x.api("/api/sessions", { workspace: "principale" });
  await x.api("/api/sessions/" + s.id + "/message", {
    content: "Ciao",
    useTools: false,
  });
  const done = await x.wait(s.id, "idle");
  assert.equal(done.messages.at(-1).content, "Ciao Vincenzo");
  assert.equal(x.calls[0].tools, undefined);
});
test("Agente: lettura automatica, scrittura bloccata, approvazione e continuazione", async (t) => {
  const x = await setup(t, async (body, n) =>
    n === 1
      ? {
          role: "assistant",
          content: "Controllo i file.",
          tool_calls: [
            tool("list_files", {}, "list"),
            tool("read_file", { path: "README.md" }, "read"),
            tool(
              "write_file",
              { path: "README.md", content: "nuovo" },
              "write",
            ),
          ],
        }
      : finish,
  );
  await x.api("/api/file", {
    workspace: "principale",
    path: "README.md",
    content: "prima",
    revision: null,
  });
  const id = await x.chat("Aggiorna README");
  const waiting = await x.wait(id, "waiting");
  assert.equal(waiting.pending.before, "prima");
  assert.equal(waiting.pending.after, "nuovo");
  assert.equal(
    (await x.api("/api/file?workspace=principale&path=README.md")).body.content,
    "prima",
  );
  assert.equal(waiting.messages.filter((m) => m.role === "tool").length, 2);
  assert.equal(
    (await x.api("/api/sessions/" + id + "/message", { content: "duplicate" }))
      .status,
    400,
  );
  const decision = { id: waiting.pending.id, allowed: true };
  assert.equal(
    (await x.api("/api/sessions/" + id + "/approval", decision)).status,
    202,
  );
  assert.equal(
    (await x.api("/api/sessions/" + id + "/approval", decision)).status,
    400,
  );
  const done = await x.wait(id, "idle");
  assert.equal(done.messages.at(-1).content, finish.content);
  assert.equal(
    (await x.api("/api/file?workspace=principale&path=README.md")).body.content,
    "nuovo",
  );
  assert.equal(x.calls[1].messages.filter((m) => m.role === "tool").length, 3);
  assert.equal(
    x.calls[1].messages.find((m) => m.tool_calls).tool_calls.length,
    3,
  );
  assert.equal(done.messages.find((m) => m.tool_calls).tool_calls.length, 3);
});
test("Rifiuto: nessun file scritto e decisione comunicata al modello", async (t) => {
  const x = await setup(t, async (body, n) =>
    n === 1
      ? {
          role: "assistant",
          tool_calls: [tool("write_file", { path: "no.txt", content: "bad" })],
        }
      : finish,
  );
  const id = await x.chat("Crea");
  const s = await x.wait(id, "waiting");
  await x.api("/api/sessions/" + id + "/approval", {
    id: s.pending.id,
    allowed: false,
  });
  await x.wait(id, "idle");
  assert.equal(
    (await x.api("/api/file?workspace=principale&path=no.txt")).status,
    400,
  );
  assert.match(
    x.calls[1].messages.find((m) => m.role === "tool").content,
    /denied/,
  );
});
test("Approvazione obsoleta: preserva una modifica manuale intervenuta nel frattempo", async (t) => {
  const x = await setup(t, async (body, n) =>
    n === 1
      ? {
          role: "assistant",
          tool_calls: [tool("write_file", { path: "a.txt", content: "agent" })],
        }
      : finish,
  );
  const id = await x.chat("Crea");
  const s = await x.wait(id, "waiting");
  await x.api("/api/file", {
    workspace: "principale",
    path: "a.txt",
    content: "human",
    revision: null,
  });
  await x.api("/api/sessions/" + id + "/approval", {
    id: s.pending.id,
    allowed: true,
  });
  const done = await x.wait(id, "idle");
  assert.match(
    done.messages.find((m) => m.role === "tool").content,
    /Conflitto/,
  );
  assert.equal(
    (await x.api("/api/file?workspace=principale&path=a.txt")).body.content,
    "human",
  );
});
test("Stop di approvazione pendente: nessuna modifica e transcript valido", async (t) => {
  const x = await setup(t, async (body, n) =>
    n === 1
      ? {
          role: "assistant",
          tool_calls: [
            tool("write_file", { path: "a", content: "x" }, "a"),
            tool("write_file", { path: "b", content: "x" }, "b"),
          ],
        }
      : finish,
  );
  const id = await x.chat("Scrivi");
  await x.wait(id, "waiting");
  await x.api("/api/sessions/" + id + "/stop", {});
  const s = await x.wait(id, "idle");
  assert.equal(s.pending, null);
  assert.equal(s.messages.filter((m) => m.role === "tool").length, 2);
  assert.equal(
    (await x.api("/api/file?workspace=principale&path=a")).status,
    400,
  );
  await x.api("/api/sessions/" + id + "/message", {
    content: "Continua senza scrivere",
  });
  await x.wait(id, "idle");
});
test("Tool sconosciuto e JSON malformato producono errori gestiti", async (t) => {
  const x = await setup(t, async (body, n) =>
    n === 1
      ? {
          role: "assistant",
          tool_calls: [
            tool("shell", { path: "x" }, "unknown"),
            {
              id: "bad",
              type: "function",
              function: { name: "read_file", arguments: "not json" },
            },
          ],
        }
      : finish,
  );
  const id = await x.chat("Test");
  const done = await x.wait(id, "idle");
  assert.equal(done.messages.filter((m) => m.role === "tool").length, 2);
  for (const m of done.messages.filter((m) => m.role === "tool"))
    assert.ok(JSON.parse(m.content).error);
});
test("Persistenza: conversazioni e approvazioni recuperate senza eseguire scritture", async (t) => {
  const x = await setup(t, async () => ({
    role: "assistant",
    tool_calls: [tool("write_file", { path: "later.txt", content: "later" })],
  }));
  const id = await x.chat("Crea");
  const s = await x.wait(id, "waiting");
  const reopened = await createApp(x.options);
  assert.equal(reopened.agent.get(id).pending.id, s.pending.id);
  assert.equal(reopened.agent.get(id).status, "waiting");
  assert.equal(
    (await x.api("/api/file?workspace=principale&path=later.txt")).status,
    400,
  );
  reopened.agent.store.close();
});
test("Riavvio durante un turno: marca errore e chiude i tool senza ripeterli", async (t) => {
  const x = await setup(t, async () => finish);
  const s = x.app.agent.create("principale");
  const live = x.app.agent.get(s.id);
  live.messages.push({
    role: "assistant",
    content: "",
    tool_calls: [tool("write_file", { path: "a", content: "x" })],
  });
  live.status = "approving";
  x.app.agent.save(live);
  const reopened = await createApp(x.options);
  const repaired = reopened.agent.get(s.id);
  assert.equal(repaired.status, "error");
  assert.equal(repaired.messages.at(-1).role, "tool");
  assert.equal(repaired.pending, null);
  reopened.agent.store.close();
});
test("Stop durante la richiesta LLM abortisce il turno senza scrivere file", async (t) => {
  const x = await setup(t, async () => {
    await new Promise((r) => setTimeout(r, 200));
    return {
      role: "assistant",
      tool_calls: [tool("write_file", { path: "cancelled", content: "x" })],
    };
  });
  const id = await x.chat("Scrivi");
  await x.api("/api/sessions/" + id + "/stop", {});
  const done = await x.wait(id, "error");
  assert.equal(done.pending, null);
  assert.equal(
    (await x.api("/api/file?workspace=principale&path=cancelled")).status,
    400,
  );
});
test("Envelope tool non valido termina in errore controllato", async (t) => {
  const x = await setup(t, async () => ({
    role: "assistant",
    tool_calls: [
      tool("read_file", { path: "x" }),
      tool("read_file", { path: "y" }),
    ],
  }));
  const id = await x.chat("Leggi");
  const s = await x.wait(id, "error");
  assert.match(s.error, /Formato tool/);
  assert.equal(s.pending, null);
});
test("Conflitto tra due salvataggi concorrenti: un solo vincitore", async (t) => {
  const x = await setup(t, async () => finish);
  const results = await Promise.all(
    ["a", "b"].map((content) =>
      x.api("/api/file", {
        workspace: "principale",
        path: "race.txt",
        content,
        revision: null,
      }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
});
test("Ricerca e modifica mirata: frammento unico, diff approvato e resto invariato", async (t) => {
  const x = await setup(t, async (body, n) =>
    n === 1
      ? {
          role: "assistant",
          tool_calls: [
            tool("search_files", { query: "prima" }, "search"),
            tool(
              "edit_file",
              { path: "a.js", old_text: "prima", new_text: "dopo" },
              "edit",
            ),
          ],
        }
      : finish,
  );
  await x.api("/api/file", {
    workspace: "principale",
    path: "a.js",
    content: "// prima\nconst x=1;",
    revision: null,
  });
  const id = await x.chat("Modifica");
  const s = await x.wait(id, "waiting");
  assert.equal(s.pending.after, "// dopo\nconst x=1;");
  await x.api("/api/sessions/" + id + "/approval", {
    id: s.pending.id,
    allowed: true,
  });
  await x.wait(id, "idle");
  const search = await x.api("/api/search?workspace=principale&q=dopo");
  assert.equal(search.body.matches[0].line, 1);
  const renamed = await x.api("/api/sessions/" + id + "/rename", {
    title: "Prova nuova",
  });
  assert.equal(renamed.body.title, "Prova nuova");
  assert.equal(
    (await x.api("/api/sessions/" + id + "/export")).body.conversation.title,
    "Prova nuova",
  );
});
test("Edit ambiguo non produce proposta né modifica", async (t) => {
  const x = await setup(t, async (body, n) =>
    n === 1
      ? {
          role: "assistant",
          tool_calls: [
            tool("edit_file", { path: "a", old_text: "x", new_text: "y" }),
          ],
        }
      : finish,
  );
  await x.api("/api/file", {
    workspace: "principale",
    path: "a",
    content: "xx",
    revision: null,
  });
  const id = await x.chat("Edit");
  const s = await x.wait(id, "idle");
  assert.match(
    s.messages.find((m) => m.role === "tool").content,
    /esattamente una/,
  );
  assert.equal(
    (await x.api("/api/file?workspace=principale&path=a")).body.content,
    "xx",
  );
});
test("Eventi SSE autenticati: snapshot e aggiornamento del titolo", async (t) => {
  const x = await setup(t, async () => finish);
  const { body: s } = await x.api("/api/sessions", { workspace: "principale" });
  const controller = new AbortController();
  const r = await fetch(x.base + "/api/sessions/" + s.id + "/events", {
    headers: { Authorization: "Bearer " + TOKEN },
    signal: controller.signal,
  });
  assert.match(r.headers.get("content-type"), /event-stream/);
  const reader = r.body.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  assert.match(first, /event: state/);
  await x.api("/api/sessions/" + s.id + "/rename", { title: "Realtime" });
  const next = new TextDecoder().decode((await reader.read()).value);
  assert.match(next, /Realtime/);
  controller.abort();
  await reader.cancel().catch(() => {});
});
test("Lingua inglese: errori API, titolo iniziale e istruzione modello", async (t) => {
  const x = await setup(t, async () => ({
    role: "assistant",
    content: "Hello",
  }));
  assert.equal(
    (await x.api("/api/not-found", undefined, { "Accept-Language": "en-US" }))
      .body.error,
    "Not found.",
  );
  const { body: s } = await x.api("/api/sessions", {
    workspace: "principale",
    language: "en",
  });
  assert.equal(s.title, "New conversation");
  await x.api("/api/sessions/" + s.id + "/message", {
    content: "Hi",
    language: "en",
    useTools: false,
  });
  const done = await x.wait(s.id, "idle");
  assert.equal(done.language, "en");
  assert.match(x.calls[0].messages[0].content, /Reply in English/);
  assert.equal(
    (
      await x.api("/api/sessions/" + s.id + "/message", {
        content: "ciao",
        language: "de",
      })
    ).status,
    400,
  );
  await x.api("/api/sessions/" + s.id + "/message", {
    content: "ciao",
    language: "it",
    useTools: false,
  });
  await x.wait(s.id, "idle");
  assert.match(x.calls[1].messages[0].content, /Rispondi in italiano/);
  assert.equal((await fetch(x.base + "/i18n.js")).status, 200);
});

test("History HTTP: authenticated list, preview and editor restore", async (t) => {
  const x = await setup(t, async () => finish);
  const file = { workspace: "principale", path: "history.txt" };
  const first = (
    await x.api("/api/file", { ...file, content: "before", revision: null })
  ).body;
  const second = (
    await x.api("/api/file", {
      ...file,
      content: "after",
      revision: first.revision,
    })
  ).body;
  const route = "/api/file-history?" + new URLSearchParams(file);
  assert.equal((await fetch(x.base + route)).status, 401);
  const list = await x.api(route);
  assert.equal(list.status, 200);
  assert.equal(list.body.versions.length, 1);
  const previous = await x.api(route + "&id=" + list.body.versions[0].id);
  assert.equal(previous.body.content, "before");
  const restored = await x.api("/api/file", {
    ...file,
    content: previous.body.content,
    revision: second.revision,
  });
  assert.equal(restored.body.content, "before");
});

test("Workspace instructions, attachments and archive/search are integrated in HTTP turns", async (t) => {
  const x = await setup(t, async () => finish);
  const instructions = await x.api("/api/instructions", {
    workspace: "principale",
    content: "Use short explanations.",
    revision: null,
  });
  assert.equal(instructions.status, 200);
  const { body: s } = await x.api("/api/sessions", { workspace: "principale" });
  const sent = await x.api("/api/sessions/" + s.id + "/message", {
    content: "Review this",
    attachments: [{ name: "example.txt", content: "UNIQUE_ATTACHMENT" }],
    profile: "light",
  });
  assert.equal(sent.status, 202);
  await x.wait(s.id, "idle");
  assert.match(x.calls[0].messages[0].content, /Use short explanations/);
  assert.match(
    x.calls[0].messages.find((m) => m.role === "user").content,
    /UNIQUE_ATTACHMENT/,
  );
  assert.equal(x.calls[0].jennySettings, undefined);
  await x.api("/api/sessions/" + s.id + "/archive", { archived: true });
  assert.equal((await x.api("/api/sessions")).body.sessions.length, 0);
  assert.equal(
    (await x.api("/api/sessions?archived=true&q=UNIQUE_ATTACHMENT")).body
      .sessions.length,
    1,
  );
  assert.equal(
    (await x.api("/api/sessions/" + s.id + "/message", { content: "again" }))
      .status,
    400,
  );
  await x.api("/api/sessions/" + s.id + "/archive", { archived: false });
  assert.equal((await x.api("/api/sessions")).body.sessions.length, 1);
  assert.equal(
    (
      await x.api("/api/sessions/" + s.id + "/message", {
        content: "x",
        attachments: [{ name: "huge", content: "x".repeat(13000) }],
      })
    ).status,
    400,
  );
  const diag = await x.api("/api/diagnostics?model=local-test");
  assert.equal(diag.body.checks.find((c) => c.name === "data").ok, true);
});
test("Multi-file approval makes separate decisions, respects conflicts and cannot be reused", async (t) => {
  const x = await setup(t, async (_, n) =>
    n === 1
      ? {
          role: "assistant",
          tool_calls: [
            tool("write_files", {
              files: [
                { path: "one.txt", content: "new one" },
                { path: "two.txt", content: "new two" },
                { path: "three.txt", content: "new three" },
              ],
            }),
          ],
        }
      : finish,
  );
  const id = await x.chat("Create three files");
  const waiting = await x.wait(id, "waiting");
  assert.equal(waiting.pending.files.length, 3);
  await x.api("/api/file", {
    workspace: "principale",
    path: "three.txt",
    content: "external",
    revision: null,
  });
  assert.equal(
    (
      await x.api("/api/sessions/" + id + "/approval", {
        id: waiting.pending.id,
        allowed: true,
      })
    ).status,
    400,
  );
  const decision = {
    id: waiting.pending.id,
    allowed: true,
    decisions: [true, false, true],
  };
  await x.api("/api/sessions/" + id + "/approval", decision);
  const done = await x.wait(id, "idle");
  assert.equal(
    (await x.api("/api/file?workspace=principale&path=one.txt")).body.content,
    "new one",
  );
  assert.equal(
    (await x.api("/api/file?workspace=principale&path=two.txt")).status,
    400,
  );
  assert.equal(
    (await x.api("/api/file?workspace=principale&path=three.txt")).body.content,
    "external",
  );
  const result = JSON.parse(
    done.messages.find((m) => m.role === "tool").content,
  );
  assert.ok(result.files[0].written);
  assert.ok(result.files[1].denied);
  assert.ok(result.files[2].error);
  assert.equal(
    (await x.api("/api/sessions/" + id + "/approval", decision)).status,
    400,
  );
});
