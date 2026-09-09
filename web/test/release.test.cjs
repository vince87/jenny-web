"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { LocalProvider } = require("../provider.cjs");
const { OllamaProvider } = require("../ollama.cjs");
const { budgetContext } = require("../context.cjs");
const { createApp } = require("../server.cjs");
const { diff, highlight } = require("../public/presentation.js");
async function endpoint(t, handler) {
  const s = http.createServer(handler);
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  t.after(
    () =>
      new Promise((r) => {
        s.closeAllConnections();
        s.close(r);
      }),
  );
  return "http://127.0.0.1:" + s.address().port;
}
const read = async (req) => {
  let text = "";
  for await (const c of req) text += c;
  return text ? JSON.parse(text) : {};
};
const event = (value) => "data: " + JSON.stringify(value) + "\r\n\r\n";
test("OpenAI SSE: chunk spezzati, Unicode, tool frammentati e usage", async (t) => {
  let request;
  const baseURL = await endpoint(t, async (req, res) => {
    request = await read(req);
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    const stream =
      event({ choices: [{ index: 0, delta: { content: "Caffè ☕" } }] }) +
      event({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "abc",
                  function: { name: "write_", arguments: '{"path":' },
                },
              ],
            },
          },
        ],
      }) +
      event({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: { name: "file", arguments: '"x","content":"ok"}' },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      }) +
      event({ choices: [], usage: { total_tokens: 32 } }) +
      "data: [DONE]\r\n\r\n";
    const bytes = Buffer.from(stream);
    for (let i = 0; i < bytes.length; i += 3)
      res.write(bytes.subarray(i, i + 3));
    res.end();
  });
  const partial = [];
  const p = new LocalProvider({ baseURL });
  const r = await p.generate(
    { model: "x", messages: [] },
    new AbortController().signal,
    (s) => partial.push(s),
  );
  assert.equal(request.stream, true);
  assert.equal(partial.at(-1), "Caffè ☕");
  assert.equal(r.choices[0].message.tool_calls[0].function.name, "write_file");
  assert.deepEqual(
    JSON.parse(r.choices[0].message.tool_calls[0].function.arguments),
    { path: "x", content: "ok" },
  );
  assert.equal(r.usage.total_tokens, 32);
});
test("OpenAI SSE incompleto non autorizza alcun tool", async (t) => {
  const baseURL = await endpoint(t, async (req, res) => {
    await read(req);
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.end(
      event({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "x",
                  function: { name: "write_file", arguments: "{" },
                },
              ],
            },
          },
        ],
      }),
    );
  });
  await assert.rejects(
    new LocalProvider({ baseURL }).generate(
      { model: "x" },
      new AbortController().signal,
    ),
    /interrotto/,
  );
});
test("Ollama nativo: opzioni, tools, thinking, metriche e round trip approvazione", async (t) => {
  const requests = [];
  const baseURL = await endpoint(t, async (req, res) => {
    const b = await read(req);
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/show")
      return res.end(
        JSON.stringify({ capabilities: ["completion", "tools", "thinking"] }),
      );
    if (req.url === "/api/tags")
      return res.end(JSON.stringify({ models: [{ name: "local-coder" }] }));
    if (req.url === "/api/version")
      return res.end(JSON.stringify({ version: "test" }));
    if (req.url === "/api/ps")
      return res.end(
        JSON.stringify({
          models: [{ name: "local-coder", size: 1000, size_vram: 800 }],
        }),
      );
    assert.equal(req.url, "/api/chat");
    requests.push(b);
    res.setHeader("Content-Type", "application/x-ndjson");
    if (requests.length === 1) {
      res.write(
        JSON.stringify({
          message: {
            thinking: "Piano di prova",
            content: "Propongo un file.",
            tool_calls: [
              {
                function: {
                  name: "write_file",
                  arguments: { path: "native.txt", content: "Ciao Ollama" },
                },
              },
            ],
          },
          done: false,
        }) + "\n",
      );
    } else
      res.write(
        JSON.stringify({ message: { content: "Salvato." }, done: false }) +
          "\n",
      );
    res.end(
      JSON.stringify({
        message: { content: "" },
        done: true,
        prompt_eval_count: 100,
        eval_count: 20,
        eval_duration: 1000000000,
        load_duration: 2000000,
        done_reason: "stop",
      }) + "\n",
    );
  });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "jenny-native-"));
  const app = await createApp({
    legacyAuth: true,
    baseURL: baseURL + "/v1",
    provider: "ollama",
    ollama: { context: 8192, predict: 2048, think: "false" },
    dataDir: path.join(dir, "data"),
    workspaceRoot: path.join(dir, "work"),
    model: "local-coder",
  });
  t.after(async () => {
    app.agent.store.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  const s = app.agent.get(app.agent.create("principale").id);
  const deltas = [];
  app.agent.subscribe(s.id, (event) => {
    if (event.delta) deltas.push(event);
  });
  app.agent.send(s, "Crea un file");
  const wait = async (status) => {
    for (let i = 0; i < 200; i++) {
      if (s.status === status) return;
      if (s.status === "error") assert.fail(s.error);
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.fail("Timeout");
  };
  await wait("waiting");
  assert.ok(deltas.some((event) => event.partialThinking === "Piano di prova"));
  assert.equal(await app.workspaces.snapshot("principale", "native.txt"), null);
  assert.equal(requests[0].options.num_ctx, 8192);
  assert.equal(requests[0].keep_alive, "10m");
  assert.equal(requests[0].think, false);
  await app.agent.approve(s, s.pending.id, true);
  await wait("idle");
  assert.equal(
    (await app.workspaces.read("principale", "native.txt")).content,
    "Ciao Ollama",
  );
  assert.equal(
    requests[1].messages.find((m) => m.role === "tool").tool_name,
    "write_file",
  );
  assert.equal(
    requests[1].messages.find((m) => m.role === "assistant").thinking,
    "Piano di prova",
  );
  assert.equal(
    typeof requests[1].messages.find((m) => m.tool_calls).tool_calls[0].function
      .arguments,
    "object",
  );
  assert.equal(s.metrics.ollama.tokensPerSecond, 20);
  assert.deepEqual(await app.agent.models(), ["local-coder"]);
  const status = await app.agent.provider.status("local-coder");
  assert.equal(status.running[0].sizeVRAM, 800);
});
test("Ollama senza tools: errore chiaro prima della generazione", async (t) => {
  const baseURL = await endpoint(t, async (req, res) => {
    await read(req);
    assert.equal(req.url, "/api/show");
    res.end(JSON.stringify({ capabilities: ["completion"] }));
  });
  const p = new OllamaProvider({ baseURL });
  await assert.rejects(
    p.generate(
      { model: "plain", messages: [], tools: [{}] },
      new AbortController().signal,
      () => {},
    ),
    /non dichiara supporto tool/,
  );
});
test("Ollama serializza inferenze concorrenti", async (t) => {
  let active = 0,
    max = 0;
  const baseURL = await endpoint(t, async (req, res) => {
    await read(req);
    if (req.url === "/api/show")
      return res.end(JSON.stringify({ capabilities: ["completion"] }));
    active++;
    max = Math.max(active, max);
    await new Promise((r) => setTimeout(r, 30));
    active--;
    res.end(JSON.stringify({ message: { content: "ok" }, done: true }) + "\n");
  });
  const p = new OllamaProvider({ baseURL });
  await Promise.all(
    [1, 2, 3].map(() =>
      p.generate(
        { model: "m", messages: [] },
        new AbortController().signal,
        () => {},
      ),
    ),
  );
  assert.equal(max, 1);
});
test("Budget contesto elimina solo turni completi e conserva i risultati tool", () => {
  const messages = [
    { role: "user", content: "old" },
    { role: "assistant", content: "x".repeat(20000) },
    { role: "user", content: "new" },
    { role: "assistant", content: "", tool_calls: [{ id: "c" }] },
    { role: "tool", tool_call_id: "c", content: "ok" },
  ];
  const b = budgetContext(
    { role: "system", content: "sys" },
    messages,
    [],
    4096,
    1024,
  );
  assert.equal(b.info.droppedTurns, 1);
  assert.deepEqual(b.messages, messages.slice(2));
  assert.throws(
    () =>
      budgetContext(
        { role: "system", content: "sys" },
        [{ role: "user", content: "x".repeat(50000) }],
        [],
        4096,
        1024,
      ),
    /budget/,
  );
});
test("Diff ricostruisce entrambi i file e highlighter neutralizza HTML", () => {
  for (const [a, b] of [
    ["a\nb\nc", "a\nB\nc"],
    ["same", "same"],
    ["", "new"],
    ["a\n", "b\n"],
    ["a\nx\nc\nx", "a\ny\nc\nz"],
  ]) {
    const rows = diff(a, b);
    assert.equal(
      rows
        .filter((r) => r.kind !== "add")
        .map((r) => r.text)
        .join("\n"),
      a,
    );
    assert.equal(
      rows
        .filter((r) => r.kind !== "remove")
        .map((r) => r.text)
        .join("\n"),
      b,
    );
  }
  const html = highlight('<img src=x onerror="evil()">');
  assert.ok(!html.includes("<img"));
  assert.match(html, /&lt;img/);
});

test("Vecchie sessioni 0.1: risultati orfani adattati senza alterare il salvataggio", () => {
  const { normalizeHistory } = require("../context.cjs");
  const original = [
    { role: "assistant", content: "", tool_calls: [] },
    { role: "tool", tool_call_id: "lost", content: "file salvato" },
  ];
  const copy = JSON.stringify(original),
    normalized = normalizeHistory(original);
  assert.equal(normalized[1].role, "assistant");
  assert.match(normalized[1].content, /storico/);
  assert.equal(JSON.stringify(original), copy);
});
test("Ollama: annullamento di una richiesta in coda non avvia una seconda inferenza", async (t) => {
  let calls = 0;
  let entered;
  const ready = new Promise((r) => (entered = r));
  const baseURL = await endpoint(t, async (req, res) => {
    await read(req);
    if (req.url === "/api/show")
      return res.end(JSON.stringify({ capabilities: ["completion"] }));
    calls++;
    entered();
    await new Promise((r) => setTimeout(r, 80));
    res.end(JSON.stringify({ message: { content: "ok" }, done: true }) + "\n");
  });
  const p = new OllamaProvider({ baseURL }),
    first = p.generate(
      { model: "m", messages: [] },
      new AbortController().signal,
      () => {},
    );
  await ready;
  const controller = new AbortController();
  const second = p.generate(
    { model: "m", messages: [] },
    controller.signal,
    () => {},
  );
  controller.abort();
  await assert.rejects(second, /fermata/);
  await first;
  assert.equal(calls, 1);
});
