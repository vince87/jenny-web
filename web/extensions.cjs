"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { readPage, request } = require("./network.cjs");
const { MCP } = require("./mcp.cjs");
const {
  GitHub,
  plan: githubPlan,
  repository,
  token: githubToken,
} = require("./github.cjs");
const CATALOG = [
  {
    id: "github",
    name: "GitHub",
    description:
      "Repository GitHub personale: lettura e scritture approvate tramite gh.",
    kind: "builtin",
  },
  {
    id: "web",
    name: "Web",
    description:
      "Ricerca e lettura di pagine pubbliche; ogni richiesta richiede approvazione.",
    kind: "builtin",
  },
  {
    id: "terminal",
    name: "Terminal",
    description:
      "Comandi nella copia temporanea del workspace, senza rete. Richiede il worker Docker.",
    kind: "builtin",
  },
  {
    id: "mcp",
    name: "MCP",
    description: "MCP HTTP 2025-11-25. Ogni chiamata richiede approvazione.",
    kind: "mcp",
  },
];
const SCHEMAS = [
  [
    "github_read",
    "Read the configured GitHub repository. Actions: repo, files (path/ref optional), issues, issue (number), prs, pr (number), commits. Requires approval.",
    {
      repository: { type: "string" },
      action: { type: "string" },
      parameters: { type: "object" },
    },
    ["repository", "action", "parameters"],
  ],
  [
    "github_write",
    "Write to the configured GitHub repository after human approval. Actions: put_file (path, branch, content, message, sha from previous read when updating); create_branch (branch, sha); create_issue (title, body); comment (number, body); create_pr (title, body, head, base). No deletion, merge or workflow writes.",
    {
      repository: { type: "string" },
      action: { type: "string" },
      parameters: { type: "object" },
    },
    ["repository", "action", "parameters"],
  ],
  [
    "web_search",
    "Search public web pages. Requires approval.",
    { query: { type: "string" } },
    ["query"],
  ],
  [
    "web_read",
    "Read a public HTTP(S) page and its links. Requires approval. No JavaScript rendering.",
    { url: { type: "string" } },
    ["url"],
  ],
  [
    "mcp_tools",
    "Discover tools from an installed MCP plugin. Requires approval.",
    { plugin: { type: "string" } },
    ["plugin"],
  ],
  [
    "mcp_call",
    "Call an installed MCP plugin tool. Requires approval for every call.",
    {
      plugin: { type: "string" },
      tool: { type: "string" },
      arguments: { type: "object" },
    },
    ["plugin", "tool", "arguments"],
  ],
  [
    "terminal_run",
    "Queue a shell command in an isolated temporary copy of this workspace. Requires approval and Docker worker. Use terminal_status to read the result.",
    { command: { type: "string" } },
    ["command"],
  ],
  [
    "terminal_status",
    "Read the result of an approved terminal job.",
    { id: { type: "string" } },
    ["id"],
  ],
];
class Extensions {
  constructor(dataDir, runner, env = process.env, { privileged = true } = {}) {
    this.privileged = privileged;
    this.search = new (require("./search.cjs").SearchConfig)(env);
    this.file = path.join(dataDir, "extensions.json");
    this.runner = runner;
    this.items = fs.existsSync(this.file)
      ? JSON.parse(fs.readFileSync(this.file, "utf8"))
      : [];
  }
  save() {
    const temp = this.file + "." + randomUUID();
    fs.writeFileSync(temp, JSON.stringify(this.items), {
      mode: 0o600,
      flag: "wx",
    });
    fs.renameSync(temp, this.file);
  }
  list() {
    return {
      catalog: CATALOG.map((x) => {
        const entries = this.items.filter((i) => i.kind === x.id);
        return {
          ...x,
          canActivate: this.privileged || x.id !== "terminal",
          state: entries.some((i) => i.enabled)
            ? "active"
            : entries.length
              ? "disabled"
              : "not-installed",
        };
      }),
      search: this.search.view(),
      installed: this.items.map(({ token, ...item }) => ({
        ...item,
        hasToken: !!token,
      })),
    };
  }
  install(body) {
    if (
      !this.privileged &&
      (body.kind === "terminal" || body.privateNetwork === true)
    )
      throw Error("Solo amministratore.");
    if (body.confirmed !== true)
      throw Error("Confirm plugin permissions before installing.");
    if (!["web", "terminal", "mcp", "github"].includes(body.kind))
      throw Error("Unsupported plugin format.");
    let item;
    if (body.kind === "mcp") {
      const url = new URL(body.url);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.hash
      )
        throw Error("Invalid MCP endpoint.");
      if (
        typeof body.name !== "string" ||
        !body.name.trim() ||
        body.name.length > 80
      )
        throw Error("Plugin name required.");
      if (
        body.token &&
        (typeof body.token !== "string" ||
          body.token.length > 4096 ||
          /[\r\n]/.test(body.token))
      )
        throw Error("Invalid bearer token.");
      if (body.token && url.protocol !== "https:")
        throw Error("Bearer credentials require HTTPS.");
      item = {
        id: randomUUID(),
        kind: "mcp",
        name: body.name,
        url: url.href,
        token: body.token || "",
        privateNetwork: body.privateNetwork === true,
        enabled: true,
      };
    } else {
      if (this.items.some((i) => i.id === body.kind))
        throw Error("Plugin already installed.");
      item = { id: body.kind, kind: body.kind, name: body.kind, enabled: true };
      if (body.kind === "github")
        Object.assign(item, {
          repository: repository(body.repository),
          token: githubToken(body.token),
          writeEnabled: body.writeEnabled === true,
        });
    }
    if (this.items.length >= 20) throw Error("Maximum 20 plugins.");
    this.items.push(item);
    this.save();
    return this.list();
  }
  manage({ id, action, confirmed }) {
    const item = this.items.find((i) => i.id === id);
    if (!item) throw Error("Plugin not found.");
    if (action === "remove") {
      if (confirmed !== true) throw Error("Removal confirmation required.");
      this.items = this.items.filter((i) => i !== item);
    } else if (["enable", "disable"].includes(action))
      item.enabled = action === "enable";
    else throw Error("Invalid plugin action.");
    this.save();
    return this.list();
  }
  available(name) {
    if (name.startsWith("github_"))
      return this.items.some(
        (i) =>
          i.kind === "github" &&
          i.enabled &&
          (name !== "github_write" || i.writeEnabled),
      );
    if (!this.privileged && name.startsWith("terminal_")) return false;
    return name.startsWith("web_")
      ? this.items.some((i) => i.id === "web" && i.enabled)
      : name.startsWith("terminal_")
        ? this.items.some((i) => i.id === "terminal" && i.enabled)
        : this.items.some((i) => i.kind === "mcp" && i.enabled);
  }
  schemas() {
    return SCHEMAS.filter(([name]) => this.available(name)).map(
      ([name, description, properties, required]) => ({
        type: "function",
        function: {
          name,
          description,
          parameters: {
            type: "object",
            properties,
            required,
            additionalProperties: false,
          },
        },
      }),
    );
  }
  validate(name, args) {
    if (
      !this.privileged &&
      name.startsWith("mcp_") &&
      this.items.find((x) => x.id === args?.plugin)?.privateNetwork
    )
      throw Error("Solo amministratore.");
    const schema = SCHEMAS.find((s) => s[0] === name);
    if (!schema || !this.available(name))
      throw Error("Plugin unavailable or disabled.");
    if (
      !args ||
      Array.isArray(args) ||
      typeof args !== "object" ||
      Object.keys(args).some((k) => !Object.hasOwn(schema[2], k))
    )
      throw Error("Invalid extension arguments.");
    for (const key of schema[3])
      if (
        typeof args[key] !== schema[2][key].type ||
        args[key] === null ||
        Array.isArray(args[key])
      )
        throw Error("Invalid extension argument: " + key);
    if (JSON.stringify(args).length > 16000)
      throw Error("Extension arguments too large.");
    if (name.startsWith("github_"))
      githubPlan(
        this.items.find((i) => i.kind === "github" && i.enabled),
        args,
        name === "github_write",
      );
    if (
      name.startsWith("mcp_") &&
      !this.items.some(
        (i) => i.id === args.plugin && i.kind === "mcp" && i.enabled,
      )
    )
      throw Error("MCP plugin not installed.");
  }
  async execute(name, args, workspace, signal) {
    this.validate(name, args);
    if (name.startsWith("github_")) {
      const item = this.items.find((i) => i.kind === "github" && i.enabled);
      const result = await new GitHub(item).execute(
        args,
        name === "github_write",
        signal,
      );
      return {
        repository: item.repository,
        result: JSON.stringify(result).slice(0, 16000),
        untrusted: true,
      };
    }
    if (name === "web_read") return readPage(args.url, signal);
    if (name === "web_search") {
      if (!args.query.trim() || args.query.length > 300)
        throw Error("Query required (max 300).");
      if (this.search.provider === "searxng")
        return this.search.searxng(args.query, signal);
      const key =
        this.search.braveKey || this.items.find((i) => i.id === "web")?.token;
      if (this.search.provider === "brave" && !key)
        throw Error("Set BRAVE_SEARCH_API_KEY in .env.");
      if (key && this.search.provider !== "duckduckgo") {
        const r = await request(
          "https://api.search.brave.com/res/v1/web/search?q=" +
            encodeURIComponent(args.query) +
            "&count=5",
          {
            signal,
            headers: {
              Accept: "application/json",
              "X-Subscription-Token": key,
            },
          },
        );
        if (r.status !== 200) throw Error("Search provider HTTP " + r.status);
        const data = JSON.parse(r.text);
        const links = (data.web?.results || []).slice(0, 5).map((x) => ({
          title: String(x.title).slice(0, 200),
          url: String(x.url).slice(0, 2000),
          description: String(x.description || "").slice(0, 1000),
        }));
        return {
          text: links
            .map((x) => x.title + "\n" + x.url + "\n" + x.description)
            .join("\n\n"),
          links,
          untrusted: true,
        };
      }
      try {
        return await readPage(
          "https://html.duckduckgo.com/html/?q=" +
            encodeURIComponent(args.query),
          signal,
        );
      } catch {
        throw Error(
          "Search provider unavailable or anti-bot verification required. Configure a Brave Search API key in the plugin settings.",
        );
      }
    }
    if (name === "terminal_run")
      return this.runner.create(workspace, "terminal", true, args.command);
    if (name === "terminal_status") {
      const job = this.runner
        .list()
        .find((j) => j.id === args.id && j.workspace === workspace);
      if (!job) throw Error("Job not found.");
      return job;
    }
    const item = this.items.find((i) => i.id === args.plugin && i.enabled);
    const client = new MCP(item);
    try {
      const result =
        name === "mcp_tools"
          ? await client.list(signal)
          : await client.call(args.tool, args.arguments, signal);
      return {
        plugin: item.id,
        result: JSON.stringify(result).slice(0, 16000),
        untrusted: true,
      };
    } finally {
      await client.close();
    }
  }
  configureWeb({ token, confirmed }) {
    if (
      confirmed !== true ||
      typeof token !== "string" ||
      token.length > 4096 ||
      /[\r\n]/.test(token)
    )
      throw Error("Invalid search credentials.");
    const item = this.items.find((i) => i.id === "web");
    if (!item) throw Error("Install Web first.");
    item.token = token;
    this.save();
    return this.list();
  }
  async check(id, confirmed, signal) {
    if (confirmed !== true)
      throw Error("Explicit execution confirmation required.");
    const item = this.items.find((i) => i.id === id);
    if (!item?.enabled) throw Error("Plugin unavailable or disabled.");
    let detail;
    try {
      if (item.kind === "web") {
        const result = await this.execute(
          "web_search",
          { query: "SearXNG documentation" },
          "",
          signal,
        );
        detail = { ok: true, results: result.links?.length || 0 };
      } else if (item.kind === "mcp") {
        this.validate("mcp_tools", { plugin: id });
        const client = new MCP(item);
        let tools;
        try {
          tools = await client.list(signal);
        } finally {
          await client.close();
        }
        detail = {
          ok: true,
          tools: tools.map((t) => ({
            name: t.name,
            description: String(t.description || "").slice(0, 300),
            inputSchema: t.inputSchema,
          })),
        };
      } else if (item.kind === "github") {
        await this.execute(
          "github_read",
          { repository: item.repository, action: "repo", parameters: {} },
          "",
          signal,
        );
        detail = { ok: true };
      } else
        throw Error(
          "Il terminale richiede il worker; la connessione non è verificabile da questo pannello.",
        );
    } catch (error) {
      detail = { ok: false, error: error.message };
    }
    if (this.items.includes(item)) {
      item.lastCheck = {
        ok: detail.ok,
        at: new Date().toISOString(),
        error: detail.error || null,
      };
      this.save();
    }
    return { ...detail, at: new Date().toISOString() };
  }
}
module.exports = { Extensions, SCHEMAS };
