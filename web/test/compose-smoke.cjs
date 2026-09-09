"use strict";
// CI fixture only: never initializes an account in a normal deployment.
const assert = require("node:assert/strict");
const path = require("node:path");
async function main() {
  if (process.env.JENNY_CI_SMOKE !== "1") throw Error("CI fixture only.");
  const password = "disposable-ci-fixture-only";
  if (process.argv[2] === "init") {
    const { acquire } = require(path.resolve("web/backup.cjs"));
    const { Accounts } = require(path.resolve("web/auth/accounts.cjs"));
    const release = await acquire(process.env.DATA_DIR);
    const accounts = new Accounts(process.env.DATA_DIR);
    try {
      await accounts.bootstrap("ci-admin", password);
    } finally {
      accounts.close();
      await release();
    }
    return;
  }
  const base = "http://127.0.0.1:3000/api";
  assert.equal((await fetch(base + "/workspaces")).status, 401);
  const login = await fetch(base + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "ci-admin", password }),
  });
  assert.equal(login.status, 200);
  const identity = await login.json();
  assert.equal(identity.user.role, "admin");
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const headers = {
    Cookie: cookie,
    "Content-Type": "application/json",
    "X-Jenny-CSRF": identity.csrf,
  };
  const projects = await fetch(base + "/workspaces", { headers });
  assert.equal(projects.status, 200);
  assert.ok((await projects.json()).workspaces.includes("principale"));
  const logout = await fetch(base + "/auth/logout", {
    method: "POST",
    headers,
    body: "{}",
  });
  assert.equal(logout.status, 200);
  assert.equal((await fetch(base + "/workspaces", { headers })).status, 401);
  console.log("Compose login, private workspace and logout verified.");
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
