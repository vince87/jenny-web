#!/usr/bin/env node
"use strict";
// Run on a dedicated Docker host, never inside the web container with its socket mounted.
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn, execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { RECIPES } = require("../runner.cjs");
const { randomUUID } = require("node:crypto");
function dockerArgs(root, job, name) {
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(job.workspace) ||
    (!Object.hasOwn(RECIPES, job.recipe) && job.recipe !== "terminal")
  )
    throw Error("Invalid job");
  if (
    job.recipe === "terminal" &&
    (typeof job.command !== "string" ||
      !job.command.trim() ||
      job.command.length > 4000 ||
      job.command.includes("\0"))
  )
    throw Error("Invalid command");
  const recipe =
    job.recipe === "terminal"
      ? { image: "node:24-bookworm-slim", command: ["sh", "-c", job.command] }
      : RECIPES[job.recipe];
  if (root.includes(",")) throw Error("Unsupported workspace root");
  return [
    "run",
    "--rm",
    "--pull=never",
    "--name",
    name,
    "--network=none",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--pids-limit=64",
    "--memory=512m",
    "--memory-swap=512m",
    "--cpus=1",
    "--user=1000:1000",
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,size=128m,mode=1777",
    "--mount",
    `type=bind,src=${path.join(root, job.workspace)},dst=/source,readonly`,
    "--workdir=/tmp",
    recipe.image,
    "timeout",
    "55s",
    "sh",
    "-c",
    'mkdir /tmp/project && cp -R /source/. /tmp/project/ && cd /tmp/project && exec "$@"',
    "runner",
    ...recipe.command,
  ];
}
async function execute(root, job) {
  dockerArgs(root, job, "validate");
  const target = path.join(root, job.workspace);
  let entries = 0,
    sourceBytes = 0;
  if (
    (await fs.realpath(target)) !== target ||
    !(await fs.lstat(target)).isDirectory()
  )
    throw Error("Invalid workspace");
  // Reject links in source so tests cannot follow a host alias, even when copying.
  async function scan(dir, depth = 0) {
    if (depth > 40) throw Error("Workspace too deep");
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      if (++entries > 10000) throw Error("Runner source exceeds 10000 entries");
      if (e.isFile()) {
        sourceBytes += (await fs.stat(path.join(dir, e.name))).size;
        if (sourceBytes > 64 * 1024 * 1024)
          throw Error("Runner source exceeds 64 MiB");
      }
      if (e.isSymbolicLink())
        throw Error("Workspace symlinks are not supported by runner");
      if (e.isDirectory()) await scan(path.join(dir, e.name), depth + 1);
    }
  }
  await scan(target);
  const name = "jenny-test-" + randomUUID();
  const args = dockerArgs(root, job, name);
  let output = "",
    bytes = 0,
    limited = false;
  const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
  const remove = () =>
    promisify(execFile)("docker", ["rm", "-f", name], { timeout: 10000 }).catch(
      () => {},
    );
  const timer = setTimeout(() => {
    limited = true;
    child.kill("SIGKILL");
  }, 60000);
  const consume = (b) => {
    bytes += b.length;
    if (bytes > 32000) {
      limited = true;
      child.kill("SIGKILL");
    } else output += b.toString();
  };
  child.stdout.on("data", consume);
  child.stderr.on("data", consume);
  try {
    const code = await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });
    return {
      ok: code === 0 && !limited,
      output: output + (limited ? "\nStopped: time/output limit." : ""),
    };
  } finally {
    clearTimeout(timer);
    await remove();
  }
}
async function main() {
  const base = process.env.JENNY_URL,
    token = process.env.JENNY_TOKEN,
    root = await fs.realpath(process.env.WORKSPACES_DIR || "./workspaces");
  if (!base || !token)
    throw Error("Set JENNY_URL, JENNY_TOKEN and WORKSPACES_DIR");
  const api = async (route, body) => {
    const r = await fetch(base + "/api" + route, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw Error("Jenny HTTP " + r.status);
    return r.json();
  };
  while (true) {
    const { job } = await api("/runner/claim", {});
    if (job) {
      let result;
      try {
        result = await execute(root, job);
      } catch (e) {
        result = { ok: false, output: e.message };
      }
      await api("/runner/complete", {
        id: job.id,
        lease: job.lease,
        ...result,
      });
    }
    if (process.argv.includes("--once")) break;
    await new Promise((r) => setTimeout(r, 3000));
  }
}
if (require.main === module)
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
module.exports = { dockerArgs, execute };
