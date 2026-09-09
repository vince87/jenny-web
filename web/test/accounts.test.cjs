"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path");
const { Accounts } = require("../auth/accounts.cjs");

test("Accounts foundation: hashes, roles, private sessions, expiry and persistence", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "jenny-accounts-"));
  let now = 1000,
    accounts = new Accounts(root, { now: () => now, sessionMs: 10000 });
  t.after(async () => {
    accounts.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const admin = await accounts.bootstrap("Owner", "owner-password");
  assert.equal(admin.username, "owner");
  assert.equal(admin.role, "admin");
  await assert.rejects(
    accounts.bootstrap("Another", "owner-password"),
    /already initialized/,
  );
  await assert.rejects(
    accounts.login("owner", "wrong-password"),
    /Invalid username or password/,
  );
  await assert.rejects(
    accounts.login("missing", "wrong-password"),
    /Invalid username or password/,
  );
  const a = await accounts.login("OWNER", "owner-password");
  const user = await accounts.createUser(a.token, "Second", "user-password");
  assert.equal(user.role, "user");
  const b = await accounts.login("second", "user-password");
  assert.equal(accounts.currentUser(a.token).id, admin.id);
  assert.equal(accounts.currentUser(b.token).id, user.id);
  await assert.rejects(
    accounts.createUser(b.token, "third", "third-password"),
    /Administrator/,
  );
  assert.throws(() => accounts.listUsers(b.token), /Administrator/);
  assert.ok(!JSON.stringify(accounts.listUsers(a.token)).includes("password"));
  accounts.setDisabled(a.token, user.id, true);
  assert.equal(accounts.currentUser(b.token), null);
  await assert.rejects(
    accounts.login("second", "user-password"),
    /Invalid username or password/,
  );
  accounts.setDisabled(a.token, user.id, false);
  assert.equal(accounts.currentUser(b.token), null);
  const c = await accounts.login("second", "user-password");
  accounts.logout(c.token);
  assert.equal(accounts.currentUser(c.token), null);
  now += 10001;
  assert.equal(accounts.currentUser(a.token), null);
  accounts.close();
  accounts = new Accounts(root);
  assert.equal(accounts.currentUser(a.token), null);
  assert.equal(
    (await accounts.login("owner", "owner-password")).user.id,
    admin.id,
  );
  const bytes = await fs.readFile(accounts.file);
  assert.equal(bytes.includes(Buffer.from("owner-password")), false);
  assert.equal(bytes.includes(Buffer.from("user-password")), false);
});

test("Accounts foundation: password change revokes all sessions; duplicate identities refused", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "jenny-password-"));
  const accounts = new Accounts(root);
  t.after(async () => {
    accounts.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  await assert.rejects(accounts.bootstrap("../escape", "long-password"));
  await assert.rejects(accounts.bootstrap("owner", "short"));
  await accounts.bootstrap("owner", "old-password");
  const a = await accounts.login("owner", "old-password");
  const b = await accounts.login("owner", "old-password");
  await assert.rejects(accounts.createUser(a.token, "OWNER", "some-password"));
  await assert.rejects(
    accounts.changePassword(a.token, "wrong-password", "new-password"),
  );
  await accounts.changePassword(a.token, "old-password", "new-password");
  assert.equal(accounts.currentUser(a.token), null);
  assert.equal(accounts.currentUser(b.token), null);
  await assert.rejects(accounts.login("owner", "old-password"));
  assert.ok((await accounts.login("owner", "new-password")).user);
});
