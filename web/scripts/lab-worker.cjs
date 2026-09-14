#!/usr/bin/env node
"use strict";
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createHash } = require("node:crypto");
const { RECIPES } = require("../runner.cjs");

const OWNER = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const WORKSPACE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

function sourceRoot(root, job) {
  if (!OWNER.test(job.owner || "") || typeof job.legacy !== "boolean")
    throw Error("Invalid job owner");
  return job.legacy ? root : path.join(root, ".users", job.owner);
}

function validate(job) {
  if (!WORKSPACE.test(job.workspace || "")) throw Error("Invalid workspace");
  if (!Object.hasOwn(RECIPES, job.recipe) && !["terminal", "sandbox"].includes(job.recipe))
    throw Error("Invalid recipe");
  if (["terminal", "sandbox"].includes(job.recipe) &&
      (typeof job.command !== "string" || !job.command.trim() || job.command.length > 4000 || job.command.includes("\0")))
    throw Error("Invalid command");
}

async function scan(root) {
  let entries = 0, bytes = 0;
  async function walk(dir, depth = 0) {
    if (depth > 40) throw Error("Workspace too deep");
    for (const item of await fs.readdir(dir, { withFileTypes: true })) {
      if (++entries > 10000) throw Error("Runner source exceeds 10000 entries");
      const target = path.join(dir, item.name);
      if (item.isSymbolicLink()) throw Error("Workspace symlinks are not supported by runner");
      if (item.isFile() && (bytes += (await fs.stat(target)).size) > 64 * 1024 * 1024)
        throw Error("Runner source exceeds 64 MiB");
      if (item.isDirectory()) await walk(target, depth + 1);
    }
  }
  await walk(root);
}

function labName(job) {
  return createHash("sha256").update(job.owner + ":" + job.workspace).digest("hex").slice(0, 32);
}

async function prepare(workspaces, labs, job) {
  validate(job);
  const source = path.join(sourceRoot(workspaces, job), job.workspace);
  if ((await fs.realpath(source)) !== source || !(await fs.lstat(source)).isDirectory())
    throw Error("Invalid workspace");
  await scan(source);
  if (job.recipe === "sandbox") {
    const root = path.join(labs, labName(job));
    const project = path.join(root, "project");
    await fs.mkdir(root, { recursive: true });
    try { await fs.access(path.join(root, ".jenny-initialized")); }
    catch {
      await fs.cp(source, project, { recursive: true, errorOnExist: true, force: false });
      await fs.mkdir(path.join(root, ".home"), { recursive: true });
      await fs.writeFile(path.join(root, ".jenny-initialized"), "1\n", { flag: "wx" });
    }
    return { cwd: project, home: path.join(root, ".home"), cleanup: null };
  }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "jenny-job-"));
  const project = path.join(root, "project");
  await fs.cp(source, project, { recursive: true });
  return { cwd: project, home: root, cleanup: root };
}

async function execute(workspaces, labs, job) {
  const prepared = await prepare(workspaces, labs, job);
  const command = job.recipe === "terminal" || job.recipe === "sandbox"
    ? job.command : RECIPES[job.recipe].command.map((x) => JSON.stringify(x)).join(" ");
  let output = "", bytes = 0, limited = false;
  const child = spawn("sh", ["-c", command], {
    cwd: prepared.cwd,
    env: { PATH: process.env.PATH, HOME: prepared.home, LANG: "C.UTF-8" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const consume = (chunk) => {
    bytes += chunk.length;
    if (bytes > 32000) { limited = true; child.kill("SIGKILL"); }
    else output += chunk.toString();
  };
  child.stdout.on("data", consume); child.stderr.on("data", consume);
  const timer = setTimeout(() => { limited = true; child.kill("SIGKILL"); }, 60000);
  try {
    const code = await new Promise((resolve, reject) => {
      child.on("error", reject); child.on("close", resolve);
    });
    return { ok: code === 0 && !limited, output: output + (limited ? "\nStopped: time/output limit." : "") };
  } finally {
    clearTimeout(timer);
    if (prepared.cleanup) await fs.rm(prepared.cleanup, { recursive: true, force: true });
  }
}

async function main() {
  const base = process.env.JENNY_URL;
  const token = process.env.JENNY_WORKER_TOKEN;
  const workspaces = await fs.realpath(process.env.WORKSPACES_DIR || "/workspaces");
  const labs = await fs.realpath(process.env.LABS_DIR || "/labs");
  if (!base || !token) throw Error("Set JENNY_URL and JENNY_WORKER_TOKEN");
  const api = async (route, body) => {
    const response = await fetch(base + "/api" + route, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw Error("Jenny HTTP " + response.status);
    return response.json();
  };
  while (true) {
    const { job } = await api("/runner/claim", {});
    if (job) {
      let result;
      try { result = await execute(workspaces, labs, job); }
      catch (error) { result = { ok: false, output: error.message }; }
      await api("/runner/complete", { id: job.id, owner: job.owner, lease: job.lease, ...result });
    }
    if (process.argv.includes("--once")) break;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { execute, labName, prepare, validate };
