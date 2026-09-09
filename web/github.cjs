"use strict";
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const REPO = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}\/[a-zA-Z0-9_.-]{1,100}$/;
function repository(value) {
  if (
    typeof value !== "string" ||
    !REPO.test(value) ||
    value.split("/").some((x) => x === "." || x === "..")
  )
    throw Error("GitHub: repository richiesto nel formato owner/repo.");
  return value;
}
function token(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 4096 ||
    /\s/.test(value)
  )
    throw Error("GitHub: token personale richiesto.");
  return value;
}
function text(value, max = 12000) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    value.includes("\0")
  )
    throw Error("GitHub: parametro testuale non valido.");
  return value;
}
function branch(value) {
  text(value, 200);
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/.test(value) ||
    value.includes("..") ||
    value.endsWith("/") ||
    value.endsWith(".lock")
  )
    throw Error("GitHub: branch non valido.");
  return value;
}
function filePath(value) {
  text(value, 500);
  if (
    value.startsWith("/") ||
    value.includes("\\") ||
    value.split("/").some((x) => !x || x === "." || x === "..") ||
    /[\r\n]/.test(value)
  )
    throw Error("GitHub: percorso relativo non valido.");
  return value.split("/").map(encodeURIComponent).join("/");
}
function number(value) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw Error("GitHub: numero issue/PR non valido.");
  return value;
}
const ACTIONS = {
  repo: [],
  files: ["path", "ref"],
  issues: [],
  issue: ["number"],
  prs: [],
  pr: ["number"],
  commits: [],
  put_file: ["path", "branch", "content", "message", "sha"],
  create_branch: ["branch", "sha"],
  create_issue: ["title", "body"],
  comment: ["number", "body"],
  create_pr: ["title", "body", "head", "base"],
};
const WRITES = new Set([
  "put_file",
  "create_branch",
  "create_issue",
  "comment",
  "create_pr",
]);
function plan(config, args, writing) {
  repository(args.repository);
  if (args.repository !== config.repository)
    throw Error("GitHub: repository diverso da quello autorizzato.");
  const p = args.parameters;
  if (
    !p ||
    typeof p !== "object" ||
    Array.isArray(p) ||
    !Object.hasOwn(ACTIONS, args.action) ||
    Object.keys(p).some((k) => !ACTIONS[args.action].includes(k)) ||
    WRITES.has(args.action) !== writing
  )
    throw Error("GitHub: operazione o parametri non consentiti.");
  if (writing && config.writeEnabled !== true)
    throw Error("GitHub: scrittura non abilitata.");
  const root = "repos/" + args.repository;
  let endpoint = root,
    method = "GET",
    body;
  switch (args.action) {
    case "files":
      endpoint +=
        "/contents" +
        (p.path ? "/" + filePath(p.path) : "") +
        (p.ref ? "?ref=" + encodeURIComponent(branch(p.ref)) : "");
      break;
    case "issues":
      endpoint += "/issues?state=all&per_page=20";
      break;
    case "issue":
      endpoint += "/issues/" + number(p.number);
      break;
    case "prs":
      endpoint += "/pulls?state=all&per_page=20";
      break;
    case "pr":
      endpoint += "/pulls/" + number(p.number);
      break;
    case "commits":
      endpoint += "/commits?per_page=20";
      break;
    case "put_file":
      endpoint += "/contents/" + filePath(p.path);
      method = "PUT";
      if (/^\.github\/workflows\//i.test(p.path))
        throw Error("GitHub: modifica workflow non supportata.");
      if (
        typeof p.content !== "string" ||
        p.content.length > 12000 ||
        p.content.includes("\0")
      )
        throw Error("GitHub: file di testo massimo 12000 caratteri.");
      body = {
        branch: branch(p.branch),
        message: text(p.message, 300),
        content: Buffer.from(p.content).toString("base64"),
      };
      if (p.sha) {
        if (!/^[a-f0-9]{40}$/.test(p.sha))
          throw Error("GitHub: SHA non valido.");
        body.sha = p.sha;
      }
      break;
    case "create_branch":
      if (!/^[a-f0-9]{40}$/.test(p.sha)) throw Error("GitHub: SHA non valido.");
      endpoint += "/git/refs";
      method = "POST";
      body = { ref: "refs/heads/" + branch(p.branch), sha: p.sha };
      break;
    case "create_issue":
      endpoint += "/issues";
      method = "POST";
      body = { title: text(p.title, 200), body: text(p.body) };
      break;
    case "comment":
      endpoint += "/issues/" + number(p.number) + "/comments";
      method = "POST";
      body = { body: text(p.body) };
      break;
    case "create_pr":
      endpoint += "/pulls";
      method = "POST";
      body = {
        title: text(p.title, 200),
        body: text(p.body),
        head: branch(p.head),
        base: branch(p.base),
      };
      break;
  }
  return { endpoint, method, body };
}
async function runGh(request, secret, signal) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "jenny-gh-"));
  try {
    const env = {
      PATH: process.env.PATH,
      GH_TOKEN: token(secret),
      GH_HOST: "github.com",
      GH_CONFIG_DIR: temp,
      HOME: temp,
      XDG_CONFIG_HOME: temp,
      GH_PROMPT_DISABLED: "1",
      GH_NO_UPDATE_NOTIFIER: "1",
      NO_COLOR: "1",
    };
    if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
    const args = [
      "api",
      "--hostname",
      "github.com",
      "--method",
      request.method,
      "-H",
      "Accept: application/vnd.github+json",
      request.endpoint,
    ];
    if (request.body) args.push("--input", "-");
    return await new Promise((resolve, reject) => {
      const child = spawn("gh", args, {
        cwd: temp,
        env,
        shell: false,
        windowsHide: true,
        signal: AbortSignal.any([
          signal || new AbortController().signal,
          AbortSignal.timeout(30000),
        ]),
      });
      const chunks = [];
      let size = 0,
        overflow = false;
      child.stdout.on("data", (data) => {
        size += data.length;
        if (size > 1024 * 1024) {
          overflow = true;
          child.kill();
        } else chunks.push(data);
      });
      child.stderr.resume(); // Never forward credentials or uncontrolled remote errors.
      child.stdin.on("error", () => {});
      child.on("error", (e) =>
        reject(
          Error(
            e.code === "ENOENT"
              ? "GitHub CLI gh non installato. Ricostruisci il container."
              : "GitHub: operazione interrotta.",
          ),
        ),
      );
      child.on("close", (code) => {
        if (code !== 0 || overflow)
          return reject(
            Error(
              "GitHub: richiesta fallita; controlla token, permessi, branch e SHA. Nessun tentativo automatico.",
            ),
          );
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()));
        } catch {
          reject(Error("GitHub: risposta non valida."));
        }
      });
      child.stdin.end(request.body ? JSON.stringify(request.body) : undefined);
    });
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}
class GitHub {
  constructor(config, run = runGh) {
    this.config = config;
    this.run = run;
  }
  async execute(args, writing, signal) {
    const request = plan(this.config, args, writing);
    const result = await this.run(request, this.config.token, signal);
    if (
      args.action === "files" &&
      result.type === "file" &&
      result.encoding === "base64"
    )
      return {
        path: result.path,
        sha: result.sha,
        url: result.html_url,
        content: Buffer.from(result.content, "base64")
          .toString("utf8")
          .slice(0, 12000),
        truncated: result.size > 12000,
      };
    return result;
  }
}
module.exports = { GitHub, plan, repository, token, runGh };
