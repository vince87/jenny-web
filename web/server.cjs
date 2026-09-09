"use strict";
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { timingSafeEqual } = require("node:crypto");
const { Workspaces } = require("./workspaces.cjs");
const { translate } = require("./public/i18n.js");
const { RunnerQueue } = require("./runner.cjs");
const { gitRead } = require("./git-read.cjs");
const { prepareTurn } = require("./turn-input.cjs");
const { PROFILES } = require("./profiles.cjs");
const { diagnose } = require("./diagnostics.cjs");
const { Agent } = require("./agent.cjs");
function equal(a, b) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
async function createRuntime(options, dataDir, root, user) {
  const workspaces = new Workspaces(root, path.join(dataDir, "file-history"));
  await workspaces.init();
  if (!(await workspaces.list()).length) await workspaces.create("principale");
  const agent = new Agent({
    provider: options.provider || process.env.LLM_PROVIDER || "ollama",
    ollama: options.ollama || {
      context: Number(process.env.OLLAMA_NUM_CTX || 8192),
      predict: Number(process.env.OLLAMA_NUM_PREDICT || 2048),
      keepAlive: process.env.OLLAMA_KEEP_ALIVE || "10m",
      temperature: Number(process.env.OLLAMA_TEMPERATURE || 0.2),
      think: process.env.OLLAMA_THINK || "auto",
    },
    dataDir,
    workspaces,
    baseURL:
      options.baseURL ||
      process.env.LLM_BASE_URL ||
      "http://127.0.0.1:11434/v1",
    apiKey: options.apiKey || process.env.LLM_API_KEY || "",
    model: options.model || process.env.LLM_MODEL || "",
    streaming: options.streaming ?? process.env.LLM_STREAMING !== "false",
    timeout: options.timeout || Number(process.env.LLM_TIMEOUT_MS || 300000),
  });
  const runner = new RunnerQueue(agent.store);
  const extensions = new (require("./extensions.cjs").Extensions)(
    dataDir,
    runner,
    process.env,
    { privileged: !user || user.role === "admin" },
  );
  agent.extensions = extensions;
  return { agent, workspaces, runner, extensions, dataDir };
}
async function createApp(options = {}) {
  const baseDataDir = path.resolve(
    options.dataDir ||
      process.env.DATA_DIR ||
      path.join(__dirname, "../web-data"),
  );
  const root = path.resolve(
    options.workspaceRoot ||
      process.env.WORKSPACES_DIR ||
      path.join(__dirname, "../workspaces"),
  );
  // Explicit library-only adapter for regression tests. Production has no token-login switch.
  const legacy = options.legacyAuth === true;
  const token = legacy ? options.token || "" : "";
  const accounts = legacy
    ? null
    : new (require("./auth/accounts.cjs").Accounts)(baseDataDir);
  const auth = legacy
    ? null
    : new (require("./auth/http.cjs").AuthHTTP)(accounts, {
        secure: process.env.JENNY_COOKIE_SECURE === "true",
      });
  const runtimes = legacy
    ? null
    : new (require("./auth/runtimes.cjs").UserRuntimes)(
        accounts,
        baseDataDir,
        root,
        (data, workspace, user) =>
          createRuntime(options, data, workspace, user),
      );
  const legacyContext = legacy
    ? await createRuntime(options, baseDataDir, root)
    : null;
  if (runtimes) await runtimes.initialize();
  if (auth) auth.onDisabled = (id) => runtimes.suspend(id);
  const workerToken =
    options.workerToken ?? process.env.JENNY_WORKER_TOKEN ?? "";
  if (workerToken && workerToken.length < 24)
    throw Error("JENNY_WORKER_TOKEN requires at least 24 characters.");
  const publicDir = path.join(__dirname, "public");
  const allowedOrigins = new Set(
    (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean),
  );
  let inFlight = 0;
  const server = http.createServer(async (req, res) => {
    inFlight++;
    const language = /^en(?:-|,|;|$)/i.test(
      req.headers["accept-language"] || "",
    )
      ? "en"
      : "it";
    const json = (value, status = 200) => {
      if (value && typeof value.error === "string")
        value = { ...value, error: translate(value.error, language) };
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify(value));
    };
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    try {
      const url = new URL(req.url, "http://localhost");
      const route = url.pathname;
      if (route === "/healthz" && req.method === "GET")
        return json({ status: "ok", app: "jenny-web" });
      if (!route.startsWith("/api/")) {
        if (req.method !== "GET")
          return json({ error: "Metodo non consentito." }, 405);
        const file = {
          "/": legacy || auth.session(req).user ? "index.html" : "login.html",
          "/login": "login.html",
          "/login.js": "login.js",
          "/auth-ui.js": "auth-ui.js",
          "/app.js": "app.js",
          "/activity-ui.js": "activity-ui.js",
          "/extensions-ui.js": "extensions-ui.js",
          "/request-state.js": "request-state.js",
          "/sessions-ui.js": "sessions-ui.js",
          "/editor-ui.js": "editor-ui.js",
          "/workbench-ui.js": "workbench-ui.js",

          "/style.css": "style.css",
          "/presentation.js": "presentation.js",
          "/i18n.js": "i18n.js",
        }[route];
        if (!file) return json({ error: "Non trovato." }, 404);
        const content = await fs.readFile(path.join(publicDir, file));
        res.setHeader(
          "Content-Type",
          file.endsWith(".html")
            ? "text/html; charset=utf-8"
            : file.endsWith(".css")
              ? "text/css; charset=utf-8"
              : "text/javascript; charset=utf-8",
        );
        return res.end(content);
      }
      if (
        legacy &&
        !token &&
        !/^(localhost|127\.0\.0\.1|\[::1\])(?::[0-9]+)?$/.test(
          req.headers.host || "",
        )
      )
        return json({ error: "Host non autorizzato senza token." }, 403);
      const origin = req.headers.origin;
      if (
        origin &&
        origin !== `http://${req.headers.host}` &&
        origin !== `https://${req.headers.host}` &&
        !allowedOrigins.has(origin)
      )
        return json({ error: "Origine non autorizzata." }, 403);
      if (req.headers["sec-fetch-site"] === "cross-site")
        return json({ error: "Richiesta cross-site bloccata." }, 403);
      if (token && !equal(req.headers.authorization || "", "Bearer " + token))
        return json(
          { error: "Inserisci il token di accesso al server Jenny." },
          401,
        );
      let body = {};
      if (req.method === "POST") {
        if (!req.headers["content-type"]?.startsWith("application/json"))
          return json({ error: "Richiesto application/json." }, 415);
        let size = 0;
        const chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 2 * 1024 * 1024) {
            json({ error: "Richiesta troppo grande." }, 413);
            return;
          }
          chunks.push(chunk);
        }
        body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
        if (!body || typeof body !== "object" || Array.isArray(body))
          throw new Error("Richiesta non valida.");
      }
      const method = req.method;
      if (!legacy && route.startsWith("/api/auth/"))
        return await auth.handle(route, req, res, body, json);
      if (
        !legacy &&
        ["/api/runner/claim", "/api/runner/complete"].includes(route)
      ) {
        if (
          method !== "POST" ||
          !workerToken ||
          !equal(req.headers.authorization || "", "Bearer " + workerToken)
        )
          return json({ error: "Worker non autorizzato." }, 403);
        return route.endsWith("/claim")
          ? json({ job: await runtimes.claim() })
          : json(await runtimes.complete(body));
      }
      const identity = legacy
        ? { user: { id: "legacy", role: "admin" }, token: "" }
        : auth.session(req);
      if (!identity.user) return json({ error: "Accesso richiesto" }, 401);
      if (!legacy && method === "POST" && !auth.verify(req, identity.token))
        return json({ error: "Richiesta non autorizzata." }, 403);
      res.setHeader("X-Jenny-User", identity.user.id);
      const { agent, workspaces, runner, extensions, dataDir } =
        legacyContext || (await runtimes.get(identity.user));
      if (!legacy && !accounts.currentUser(identity.token))
        return json({ error: "Accesso richiesto" }, 401);
      if (
        !legacy &&
        identity.user.role !== "admin" &&
        route.startsWith("/api/runner")
      )
        return json({ error: "Solo amministratore." }, 403);
      if (route === "/api/config" && method === "GET")
        return json({
          provider: agent.provider.kind,
          ollama: agent.provider.settings || null,
          model: agent.model,
          baseURL: agent.baseURL,
          version: require("./package.json").version,
          user: identity.user,
          profiles: PROFILES,
          streaming: agent.provider.streaming,
          tools: [
            ...agent.registry.getToolSchemas(),
            ...extensions.schemas(),
          ].map((t) => t.function.name),
        });
      if (route === "/api/extensions" && method === "GET")
        return json(extensions.list());
      if (route === "/api/extensions/install" && method === "POST")
        return json(extensions.install(body), 201);
      if (route === "/api/extensions/manage" && method === "POST")
        return json(extensions.manage(body));
      if (route === "/api/extensions/web" && method === "POST")
        return json(extensions.configureWeb(body));
      if (route === "/api/extensions/execute" && method === "POST") {
        if (body.confirmed !== true)
          throw Error("Explicit execution confirmation required.");
        await workspaces.service(body.workspace);
        return json(
          await extensions.execute(
            body.name,
            body.arguments,
            body.workspace,
            AbortSignal.timeout(60000),
          ),
        );
      }
      if (route === "/api/provider-status" && method === "GET")
        return json(
          agent.provider.kind === "ollama"
            ? await agent.provider.status(url.searchParams.get("model") || "")
            : { provider: "openai" },
        );
      if (route === "/api/export-chats" && method === "GET")
        return json({
          format: "jenny-chats",
          version: 1,
          sessions: agent.store.all(),
          exportedAt: new Date().toISOString(),
        });
      if (route === "/api/git" && method === "GET")
        return json(
          await gitRead(
            workspaces,
            url.searchParams.get("workspace"),
            url.searchParams.get("action") || "status",
          ),
        );
      if (route === "/api/runner" && method === "GET")
        return json({ jobs: runner.list() });
      if (route === "/api/runner" && method === "POST") {
        await workspaces.service(body.workspace);
        return json(
          runner.create(body.workspace, body.recipe, body.confirmed),
          201,
        );
      }
      if (route === "/api/runner/cancel" && method === "POST")
        return json(runner.cancel(body.id));
      if (route === "/api/runner/claim" && method === "POST")
        return json({ job: runner.claim() });
      if (route === "/api/runner/complete" && method === "POST")
        return json(runner.complete(body.id, body.lease, body));
      if (route === "/api/diagnostics" && method === "GET")
        return json(
          await diagnose(
            agent,
            workspaces,
            dataDir,
            url.searchParams.get("model") || agent.model,
          ),
        );
      if (route === "/api/instructions" && method === "GET")
        return json(
          (await workspaces.instructions(
            url.searchParams.get("workspace"),
          )) || { content: "", revision: null, path: "JENNY.md" },
        );
      if (route === "/api/instructions" && method === "POST") {
        if (
          typeof body.content !== "string" ||
          Array.from(body.content).length > 6000
        )
          throw new Error("JENNY.md supera 6000 caratteri.");
        return json(
          await workspaces.write(
            body.workspace,
            "JENNY.md",
            body.content,
            body.revision,
          ),
        );
      }
      if (route === "/api/models" && method === "GET")
        return json({ models: await agent.models() });
      if (route === "/api/workspaces" && method === "GET")
        return json({ workspaces: await workspaces.list() });
      if (route === "/api/workspaces" && method === "POST")
        return json({ workspace: await workspaces.create(body.name) }, 201);
      if (route === "/api/files" && method === "GET")
        return json(
          await workspaces.listFiles(
            url.searchParams.get("workspace"),
            url.searchParams.get("path") || "",
          ),
        );
      if (route === "/api/search" && method === "GET")
        return json(
          await workspaces.search(
            url.searchParams.get("workspace"),
            url.searchParams.get("q"),
            url.searchParams.get("path") || "",
          ),
        );
      if (route === "/api/file-history" && method === "GET")
        return json(
          await workspaces.history(
            url.searchParams.get("workspace"),
            url.searchParams.get("path"),
            url.searchParams.get("id") ?? undefined,
          ),
        );
      if (route === "/api/file" && method === "GET")
        return json(
          await workspaces.read(
            url.searchParams.get("workspace"),
            url.searchParams.get("path"),
          ),
        );
      if (route === "/api/file" && method === "POST")
        return json(
          await workspaces.write(
            body.workspace,
            body.path,
            body.content,
            body.revision,
          ),
        );
      if (route === "/api/sessions" && method === "GET")
        return json({
          sessions: agent.list(
            (url.searchParams.get("q") || "").slice(0, 200),
            url.searchParams.get("archived") === "true",
          ),
        });
      if (route === "/api/sessions" && method === "POST") {
        await workspaces.service(body.workspace);
        return json(agent.create(body.workspace, body.language), 201);
      }
      const match = route.match(
        /^\/api\/sessions\/([a-f0-9-]+)(?:\/(message|approval|stop|events|export|rename|archive))?$/,
      );
      if (match) {
        const s = agent.get(match[1]);
        const action = match[2];
        if (action === "events" && method === "GET") {
          if ((agent.listeners.get(s.id)?.size || 0) >= 16)
            return json({ error: "Troppe connessioni per questa chat." }, 429);
          res.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          });
          const send = (state) => {
            if (!legacy && !accounts.currentUser(identity.token))
              return res.end();
            if (res.writableLength > 1024 * 1024) return res.destroy();
            res.write(
              "event: " +
                (state.delta ? "delta" : "state") +
                "\ndata: " +
                JSON.stringify(state) +
                "\n\n",
            );
          };
          send(agent.view(s));
          const unsubscribe = agent.subscribe(s.id, send);
          const heartbeat = setInterval(
            () =>
              !legacy && !accounts.currentUser(identity.token)
                ? res.end()
                : res.write(": heartbeat\n\n"),
            15000,
          );
          heartbeat.unref();
          res.on("close", () => {
            clearInterval(heartbeat);
            unsubscribe();
          });
          return;
        }
        if (action === "export" && method === "GET")
          return json({
            version: 1,
            exportedAt: new Date().toISOString(),
            conversation: agent.view(s),
          });
        if (!action && method === "GET") return json(agent.view(s));
        if (method === "POST") {
          if (action === "archive") {
            agent.archive(s, body.archived);
          } else if (action === "rename") {
            if (
              typeof body.title !== "string" ||
              !body.title.trim() ||
              body.title.length > 100
            )
              throw new Error("Titolo richiesto, massimo 100 caratteri.");
            s.title = body.title.trim();
            agent.save(s);
          } else if (action === "message") {
            const input = await prepareTurn(agent, s, body);
            if (!legacy && !accounts.currentUser(identity.token))
              return json({ error: "Accesso richiesto" }, 401);
            if (
              !legacy &&
              [...agent.sessions.values()].filter((x) =>
                ["running", "waiting", "approving"].includes(x.status),
              ).length >= 2
            )
              throw Error("Massimo due turni attivi per utente.");
            agent.send(
              s,
              input.content,
              body.model,
              body.useTools,
              body.language,
              input,
            );
          } else if (action === "approval") {
            if (typeof body.allowed !== "boolean")
              throw new Error("Decisione non valida.");
            await agent.approve(s, body.id, body.allowed, body.decisions);
          } else if (action === "stop") agent.stop(s);
          else return json({ error: "Non trovato." }, 404);
          return json(agent.view(s), 202);
        }
      }
      json({ error: "Non trovato." }, 404);
    } catch (e) {
      if (!res.headersSent)
        json(
          {
            error:
              e.code === "ENOENT" ? "File o workspace non trovato." : e.message,
          },
          400,
        );
      else res.end();
    } finally {
      inFlight--;
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  let closing;
  const close = () =>
    (closing ??= (async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      while (inFlight) await new Promise((resolve) => setTimeout(resolve, 10));
      if (runtimes) {
        await runtimes.close();
        accounts.close();
      } else legacyContext.agent.store.close();
    })());
  return { server, ...(legacyContext || {}), accounts, runtimes, close };
}
if (require.main === module) {
  const host = process.env.HOST || "127.0.0.1";
  const port = Number(process.env.PORT || 3000);
  let release;
  require("./backup.cjs")
    .acquire(
      path.resolve(process.env.DATA_DIR || path.join(__dirname, "../web-data")),
    )
    .then((unlock) => {
      release = unlock;
      return createApp();
    })
    .then(({ server, close }) => {
      server.listen(port, host, () =>
        console.log(`Jenny Web disponibile su http://${host}:${port}`),
      );
      let shuttingDown = false;
      const shutdown = () => {
        if (shuttingDown) return;
        shuttingDown = true;
        setTimeout(async () => {
          await close();
          await release();
          process.exit(0);
        }, 3000);
      };
      process.on("SIGTERM", shutdown);
      process.on("SIGINT", shutdown);
    })
    .catch((e) => {
      console.error(e.message);
      release?.();
      process.exitCode = 1;
    });
}
module.exports = { createApp };
