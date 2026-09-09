"use strict";

// Local accounts. HTTP identity is always derived from an opaque session cookie.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { DatabaseSync } = require("node:sqlite");
const scrypt = promisify(crypto.scrypt);
const HASH_OPTIONS = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
let hashQueue = Promise.resolve();
let pendingHashes = 0;

function username(value) {
  if (
    typeof value !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,31}$/.test(value)
  ) {
    throw new Error(
      "Username: 3–32 letters, numbers, dots, dashes or underscores.",
    );
  }
  return value.toLowerCase();
}

function password(value) {
  if (
    typeof value !== "string" ||
    value.length < 8 ||
    Buffer.byteLength(value) > 1024
  ) {
    throw new Error("Password: at least 8 characters, at most 1024 bytes.");
  }
  return value;
}

async function derive(value, salt) {
  // Serialize expensive hashes and bound the queue on modest local servers.
  if (pendingHashes >= 8)
    throw new Error("Authentication busy; retry shortly.");
  pendingHashes++;
  const task = hashQueue.then(() => scrypt(value, salt, 64, HASH_OPTIONS));
  hashQueue = task.catch(() => {});
  try {
    return await task;
  } finally {
    pendingHashes--;
  }
}

const tokenHash = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");
const publicUser = (row) =>
  row && {
    id: row.id,
    username: row.username,
    role: row.role,
    disabled: !!row.disabled,
  };

class Accounts {
  constructor(
    dataDir,
    { now = Date.now, sessionMs = 8 * 60 * 60 * 1000 } = {},
  ) {
    if (!Number.isSafeInteger(sessionMs) || sessionMs <= 0)
      throw new Error("Invalid session lifetime.");
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    this.file = path.join(dataDir, "accounts.sqlite");
    this.db = new DatabaseSync(this.file);
    fs.chmodSync(this.file, 0o600);
    this.db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS account_metadata (version INTEGER NOT NULL) STRICT;
      INSERT INTO account_metadata SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM account_metadata);`);
    if (
      this.db.prepare("SELECT version FROM account_metadata").get().version !==
      1
    ) {
      this.db.close();
      throw new Error("Unsupported accounts database version.");
    }
    this.db.exec(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, salt TEXT NOT NULL,
      password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','user')),
      disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0,1))
    ) STRICT;`);
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS account_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL) STRICT;",
    );
    this.sessions = new Map();
    this.now = now;
    this.sessionMs = sessionMs;
  }

  async credentials(name, secret) {
    const normalized = username(name);
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = (await derive(password(secret), salt)).toString("hex");
    return { name: normalized, salt, hash };
  }

  insert(credentials, role) {
    const id = crypto.randomUUID();
    this.db
      .prepare(
        "INSERT INTO users(id,username,salt,password_hash,role) VALUES(?,?,?,?,?)",
      )
      .run(id, credentials.name, credentials.salt, credentials.hash, role);
    return publicUser(
      this.db.prepare("SELECT * FROM users WHERE id=?").get(id),
    );
  }

  async bootstrap(name, secret) {
    const credentials = await this.credentials(name, secret);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (this.db.prepare("SELECT COUNT(*) AS count FROM users").get().count)
        throw new Error("Administrator already initialized.");
      const user = this.insert(credentials, "admin");
      this.db
        .prepare("INSERT INTO account_settings VALUES('legacy-owner',?)")
        .run(user.id);
      this.db.exec("COMMIT");
      return user;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  currentUser(token) {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return null;
    const key = tokenHash(token),
      session = this.sessions.get(key);
    if (!session) return null;
    const row = this.db
      .prepare("SELECT * FROM users WHERE id=?")
      .get(session.userId);
    if (session.expires <= this.now() || !row || row.disabled) {
      this.sessions.delete(key);
      return null;
    }
    return publicUser(row);
  }

  admin(token) {
    const user = this.currentUser(token);
    if (user?.role !== "admin")
      throw new Error("Administrator session required.");
    return user;
  }

  async createUser(adminToken, name, secret) {
    this.admin(adminToken);
    const credentials = await this.credentials(name, secret);
    this.admin(adminToken); // Session may have expired while hashing.
    if (this.allUsers().length >= 20)
      throw new Error("Maximum 20 local users.");
    return this.insert(credentials, "user");
  }

  allUsers() {
    return this.db
      .prepare("SELECT * FROM users ORDER BY rowid")
      .all()
      .map(publicUser);
  }
  legacyOwner() {
    return this.db
      .prepare("SELECT value FROM account_settings WHERE key='legacy-owner'")
      .get()?.value;
  }
  getUser(id) {
    return publicUser(
      this.db.prepare("SELECT * FROM users WHERE id=?").get(id),
    );
  }
  async resetPasswordLocal(name, secret) {
    const row = this.db
      .prepare("SELECT * FROM users WHERE username=?")
      .get(username(name));
    if (!row) throw new Error("User not found.");
    const credentials = await this.credentials(name, secret);
    this.db
      .prepare("UPDATE users SET salt=?,password_hash=? WHERE id=?")
      .run(credentials.salt, credentials.hash, row.id);
    this.revokeUser(row.id);
  }

  async login(name, secret) {
    let normalized;
    try {
      normalized = username(name);
      password(secret);
    } catch {
      throw new Error("Invalid username or password.");
    }
    const row = this.db
      .prepare("SELECT * FROM users WHERE username=?")
      .get(normalized);
    const hash = await derive(secret, row?.salt || "0".repeat(32));
    const expected = row
      ? Buffer.from(row.password_hash, "hex")
      : Buffer.alloc(64);
    if (
      expected.length !== hash.length ||
      !crypto.timingSafeEqual(hash, expected) ||
      !row ||
      row.disabled
    )
      throw new Error("Invalid username or password.");
    const fresh = this.db.prepare("SELECT * FROM users WHERE id=?").get(row.id);
    if (!fresh || fresh.disabled || fresh.password_hash !== row.password_hash)
      throw new Error("Invalid username or password.");
    for (const [key, session] of this.sessions)
      if (session.expires <= this.now()) this.sessions.delete(key);
    if (this.sessions.size >= 1000)
      throw new Error("Too many active sessions.");
    const token = crypto.randomBytes(32).toString("hex");
    this.sessions.set(tokenHash(token), {
      userId: row.id,
      expires: this.now() + this.sessionMs,
    });
    return { token, user: publicUser(row) };
  }

  logout(token) {
    if (typeof token === "string") this.sessions.delete(tokenHash(token));
  }

  revokeUser(id) {
    for (const [key, session] of this.sessions)
      if (session.userId === id) this.sessions.delete(key);
  }

  setDisabled(adminToken, id, disabled) {
    const admin = this.admin(adminToken);
    if (id === admin.id || typeof disabled !== "boolean")
      throw new Error("Invalid account update.");
    const changed = this.db
      .prepare("UPDATE users SET disabled=? WHERE id=?")
      .run(Number(disabled), id);
    if (!changed.changes) throw new Error("User not found.");
    this.revokeUser(id);
  }

  listUsers(adminToken) {
    this.admin(adminToken);
    return this.db
      .prepare("SELECT * FROM users ORDER BY username")
      .all()
      .map(publicUser);
  }

  async changePassword(token, currentPassword, newPassword) {
    const user = this.currentUser(token);
    if (!user) throw new Error("Login required.");
    password(currentPassword);
    password(newPassword);
    const row = this.db.prepare("SELECT * FROM users WHERE id=?").get(user.id);
    const hash = await derive(currentPassword, row.salt);
    if (!crypto.timingSafeEqual(hash, Buffer.from(row.password_hash, "hex")))
      throw new Error("Invalid username or password.");
    const credentials = await this.credentials(row.username, newPassword);
    if (!this.currentUser(token)) throw new Error("Login required.");
    const updated = this.db
      .prepare(
        "UPDATE users SET salt=?,password_hash=? WHERE id=? AND password_hash=?",
      )
      .run(credentials.salt, credentials.hash, row.id, row.password_hash);
    if (!updated.changes) throw new Error("Account changed; log in again.");
    this.revokeUser(row.id);
  }

  close() {
    this.sessions.clear();
    this.db.close();
  }
}

module.exports = { Accounts };
