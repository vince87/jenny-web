"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
class SessionStore {
  constructor(dataDir) {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    this.file = path.join(dataDir, "jenny.sqlite");
    this.db = new DatabaseSync(this.file);
    fs.chmodSync(this.file, 0o600);
    if (this.db.prepare("PRAGMA user_version").get().user_version > 1) {
      this.db.close();
      throw new Error("Database version newer than this application");
    }
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, body TEXT NOT NULL) STRICT; CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT; PRAGMA user_version=1;",
    );
    this.put = this.db.prepare(
      "INSERT INTO sessions(id,body) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
    );
    if (
      !this.db
        .prepare("SELECT value FROM metadata WHERE key='legacy-import'")
        .get()
    ) {
      const legacy = path.join(dataDir, "sessions");
      const records = [];
      if (fs.existsSync(legacy))
        for (const file of fs
          .readdirSync(legacy)
          .filter((n) => /^[a-f0-9-]+\.json$/.test(n))) {
          try {
            const s = JSON.parse(
              fs.readFileSync(path.join(legacy, file), "utf8"),
            );
            if (s.id + ".json" !== file || !Array.isArray(s.messages))
              throw Error("Invalid");
            records.push(s);
          } catch {
            console.error("Legacy session unreadable, preserved:", file);
          }
        }
      this.transaction(() => {
        for (const s of records) this.put.run(s.id, JSON.stringify(s));
        this.db
          .prepare("INSERT INTO metadata VALUES('legacy-import','1')")
          .run();
      });
    }
  }
  transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  save(s) {
    this.put.run(s.id, JSON.stringify(s));
  }
  all() {
    return this.db
      .prepare("SELECT body FROM sessions")
      .all()
      .map((r) => JSON.parse(r.body));
  }
  close() {
    this.db.close();
  }
}
module.exports = { SessionStore };
