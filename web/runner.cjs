"use strict";
const { randomUUID } = require("node:crypto");
const RECIPES = {
  "node-test": { image: "node:24-bookworm-slim", command: ["node", "--test"] },
  "python-compile": {
    image: "python:3.12-slim",
    command: ["python", "-m", "compileall", "-q", "."],
  },
};
class RunnerQueue {
  constructor(store) {
    this.db = store.db;
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, body TEXT NOT NULL) STRICT",
    );
    for (const row of this.db.prepare("SELECT body FROM jobs").all()) {
      const j = JSON.parse(row.body);
      if (j.status === "running") {
        j.status = "interrupted";
        j.output = "Runner interrotto: nessuna ripetizione automatica.";
        this.save(j);
      }
    }
  }
  save(j) {
    this.db
      .prepare(
        "INSERT INTO jobs VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
      )
      .run(j.id, JSON.stringify(j));
  }
  list() {
    return this.db
      .prepare("SELECT body FROM jobs ORDER BY rowid DESC LIMIT 30")
      .all()
      .map((r) => {
        const job = JSON.parse(r.body);
        if (
          job.status === "running" &&
          Date.now() - Date.parse(job.startedAt || job.createdAt) > 120000
        ) {
          job.status = "interrupted";
          job.output = "Runner timeout; no automatic retry.";
          delete job.lease;
          this.save(job);
        }
        const { lease, ...j } = job;
        return j;
      });
  }
  create(workspace, recipe, confirmed, command) {
    if (
      (!Object.hasOwn(RECIPES, recipe) && recipe !== "terminal") ||
      confirmed !== true
    )
      throw new Error("Conferma richiesta per il runner.");
    if (
      recipe === "terminal" &&
      (typeof command !== "string" ||
        !command.trim() ||
        command.length > 4000 ||
        command.includes("\0"))
    )
      throw Error("Command required (max 4000).");
    if (this.list().some((j) => ["queued", "running"].includes(j.status)))
      throw new Error("Un test è già in coda o in esecuzione.");
    const j = {
      id: randomUUID(),
      workspace,
      recipe,
      ...(recipe === "terminal" ? { command } : {}),
      status: "queued",
      createdAt: new Date().toISOString(),
      output: "",
    };
    this.save(j);
    return j;
  }
  claim() {
    const j = this.list()
      .reverse()
      .find((j) => j.status === "queued");
    if (!j) return null;
    j.lease = randomUUID();
    j.startedAt = new Date().toISOString();
    j.status = "running";
    this.save(j);
    return j;
  }
  complete(id, lease, result) {
    const row = this.db.prepare("SELECT body FROM jobs WHERE id=?").get(id);
    if (!row) throw new Error("Test non trovato.");
    const j = JSON.parse(row.body);
    if (j.status !== "running" || j.lease !== lease)
      throw new Error("Risultato runner non valido.");
    j.status = result.ok === true ? "passed" : "failed";
    j.output = String(result.output || "").slice(0, 32000);
    delete j.lease;
    this.save(j);
    return { ok: true };
  }
  cancel(id) {
    const j = this.list().find((j) => j.id === id);
    if (!j || j.status !== "queued")
      throw new Error("Solo i test in coda possono essere annullati.");
    j.status = "cancelled";
    this.save(j);
    return j;
  }
}
module.exports = { RunnerQueue, RECIPES };
