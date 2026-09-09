"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { WorkspaceIdeService } = require("../services/workspace-ide-service");
const {
  normalizeWorkspaceRelPath,
} = require("../services/workspace-ide-path-guard");
const {
  WorkspaceRootCoordinator,
} = require("../services/workspace-root-coordinator");
const MAX_FILE = 256 * 1024;
const digest = (content) =>
  crypto.createHash("sha256").update(content).digest("hex");
class Workspaces {
  constructor(root, historyRoot = path.join(root, ".jenny-history")) {
    this.historyRoot = path.resolve(historyRoot);
    this.root = path.resolve(root);
    this.queue = Promise.resolve();
  }
  async init() {
    await fs.mkdir(this.root, { recursive: true });
    this.root = await fs.realpath(this.root);
  }
  validName(name) {
    if (
      typeof name !== "string" ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(name)
    )
      throw new Error("Nome workspace non valido: usa lettere, numeri, - e _.");
    return name;
  }
  async list() {
    const entries = await fs.readdir(this.root, { withFileTypes: true });
    return entries
      .filter(
        (e) =>
          e.isDirectory() && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(e.name),
      )
      .map((e) => e.name)
      .sort();
  }
  async create(name) {
    this.validName(name);
    await fs.mkdir(path.join(this.root, name));
    return name;
  }
  async service(name) {
    this.validName(name);
    const root = path.join(this.root, name);
    const st = await fs.lstat(root);
    if (
      !st.isDirectory() ||
      st.isSymbolicLink() ||
      (await fs.realpath(root)) !== root
    )
      throw new Error("Workspace non valido.");
    const coordinator = new WorkspaceRootCoordinator({
      initialRootPath: root,
      normalizeRootPath: (v) => v,
      rootIdFactory: (v) => v,
    });
    return new WorkspaceIdeService({
      configService: { getToolsWorkspaceRoot: () => root },
      rootContextProvider: () => coordinator,
    });
  }
  // Reject symlinks even inside the workspace: no surprising aliases in this MVP.
  async guard(name, file, allowRoot = false) {
    await this.service(name);
    if (allowRoot && (file === "" || file === ".")) return "";
    const normalized = normalizeWorkspaceRelPath(file);
    if (
      normalized.split("/").some((p) => p === ".git" || /[\x00-\x1f]/.test(p))
    )
      throw new Error("Percorso protetto o non valido.");
    let current = path.join(this.root, name);
    for (const part of normalized.split("/")) {
      current = path.join(current, part);
      try {
        if ((await fs.lstat(current)).isSymbolicLink())
          throw new Error("I collegamenti simbolici non sono supportati.");
      } catch (e) {
        if (e.code === "ENOENT") break;
        throw e;
      }
    }
    return normalized;
  }
  async listFiles(name, file = "") {
    file = await this.guard(name, file, true);
    const result = await (
      await this.service(name)
    ).listDirectory({ path: file, maxEntries: 300 });
    result.entries = result.entries.filter(
      (e) => e.kind === "file" || e.kind === "directory",
    );
    return result;
  }
  async read(name, file) {
    file = await this.guard(name, file);
    const r = await (
      await this.service(name)
    ).readFile({ path: file, maxBytes: MAX_FILE });
    return { ...r, revision: digest(r.content) };
  }
  async snapshot(name, file) {
    try {
      return await this.read(name, file);
    } catch (e) {
      if (e.code === "ENOENT" || e.code === "CMP-WORKSPACEFS-0004") return null;
      throw e;
    }
  }
  async readRange(name, file, startLine = 1, endLine = 200, startChar = 0, maxChars = 8000) {
    if (!Number.isInteger(startChar) || startChar < 0 || !Number.isInteger(maxChars) || maxChars < 1 || maxChars > 12000) throw new Error("Limiti di lettura non validi.");
    if (
      !Number.isInteger(startLine) ||
      !Number.isInteger(endLine) ||
      startLine < 1 ||
      endLine < startLine ||
      endLine - startLine > 399
    )
      throw new Error("Intervallo non valido: massimo 400 righe.");
    const r = await this.read(name, file),
      lines = r.content.split("\n");
    const selected = Array.from(lines.slice(startLine - 1, endLine).join("\n"));
    const content = selected.slice(startChar, startChar + maxChars).join("");
    return {
      path: r.path,
      revision: r.revision,
      startLine,
      endLine: Math.min(endLine, lines.length),
      totalLines: lines.length,
      content,
      startChar,
      nextStartChar: startChar + maxChars < selected.length ? startChar + maxChars : null,
      rangeChars: selected.length,
      truncated: endLine < lines.length || startChar + maxChars < selected.length,
    };
  }
  async search(name, query, root = "", limit = 100) {
    if (typeof query !== "string" || !query.trim() || query.length > 200)
      throw new Error("Ricerca richiesta, massimo 200 caratteri.");
    await this.guard(name, root, true);
    const pending = [root],
      matches = [],
      deadline = Date.now() + 3000;
    let scanned = 0,
      directories = 0,
      truncated = false;
    const needle = query.toLocaleLowerCase();
    while (
      pending.length &&
      scanned < 400 &&
      directories < 100 &&
      matches.length < limit &&
      Date.now() < deadline
    ) {
      const folder = pending.shift();
      directories++;
      let listing;
      try {
        listing = await this.listFiles(name, folder);
      } catch {
        continue;
      }
      truncated ||= listing.truncated;
      for (const e of listing.entries) {
        if (Date.now() >= deadline || scanned >= 400 || matches.length >= limit) {
          truncated = true;
          break;
        }
        if (e.kind === "directory") {
          if (
            ![
              "node_modules",
              "vendor",
              ".venv",
              "dist",
              "build",
              "__pycache__",
            ].includes(e.name)
          )
            pending.push(e.relPath);
          continue;
        }
        scanned++;
        if (e.relPath.toLocaleLowerCase().includes(needle))
          matches.push({ path: e.relPath, line: 0, text: "Nome file" });
        try {
          const r = await this.read(name, e.relPath);
          let fileMatches = 0;
          for (const [i, line] of r.content.split("\n").entries()) {
            if (matches.length >= limit) {
              truncated = true;
              break;
            }
            const at = line.toLocaleLowerCase().indexOf(needle);
            if (at >= 0) {
              if (++fileMatches > 5) { truncated = true; break; }
              const offset = Math.max(0, at - 60);
              matches.push({
                path: e.relPath,
                line: i + 1,
                text: line.slice(offset, offset + 240),
                column: at + 1,
                snippetTruncated: offset > 0 || line.length > offset + 240,
              });
            }
          }
        } catch {
          /* Skip binary, large or unreadable entries; never leave the root. */
        }
      }
    }
    return {
      query,
      matches,
      scanned,
      directories,
      truncated: truncated || pending.length > 0,
    };
  }
  async instructions(name) {
    const r = await this.snapshot(name, "JENNY.md");
    if (r && Array.from(r.content).length > 6000) throw new Error("JENNY.md supera 6000 caratteri.");
    return r;
  }
  async historyDirectory(name, file) {
    file = await this.guard(name, file);
    return path.join(this.historyRoot, digest(name + "/" + file));
  }
  async history(name, file, id) {
    const directory = await this.historyDirectory(name, file);
    if (id !== undefined) {
      if (typeof id !== "string" || !/^[0-9]+-[a-f0-9-]+$/.test(id))
        throw new Error("Versione non valida.");
      const entry = JSON.parse(
        await fs.readFile(path.join(directory, id + ".json"), "utf8"),
      );
      if (entry.revision !== digest(entry.content))
        throw new Error("Versione non valida.");
      return entry;
    }
    let names;
    try {
      names = await fs.readdir(directory);
    } catch (e) {
      if (e.code === "ENOENT") return { versions: [] };
      throw e;
    }
    return {
      versions: names
        .filter((n) => /^[0-9]+-[a-f0-9-]+\.json$/.test(n))
        .sort()
        .reverse()
        .map((n) => ({
          id: n.slice(0, -5),
          date: new Date(Number(n.split("-")[0])).toISOString(),
        })),
    };
  }
  async preserve(name, file, before) {
    if (!before) return;
    const directory = await this.historyDirectory(name, file);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const id = Date.now() + "-" + process.hrtime.bigint().toString(16).padStart(16,"0") + "-" + crypto.randomUUID();
    await fs.writeFile(
      path.join(directory, id + ".json"),
      JSON.stringify({ content: before.content, revision: before.revision }),
      { flag: "wx", mode: 0o600 },
    );
    const { versions } = await this.history(name, file);
    for (const old of versions.slice(30))
      await fs.unlink(path.join(directory, old.id + ".json"));
  }
  async write(name, file, content, expectedRevision) {
    if (typeof content !== "string" || Buffer.byteLength(content) > MAX_FILE)
      throw new Error("Contenuto non valido o oltre 256 KiB.");
    if (
      expectedRevision !== null &&
      (typeof expectedRevision !== "string" ||
        !/^[a-f0-9]{64}$/.test(expectedRevision))
    )
      throw new Error("Revisione del file obbligatoria.");
    const task = async () => {
      file = await this.guard(name, file);
      const before = await this.snapshot(name, file);
      if ((before?.revision ?? null) !== expectedRevision)
        throw new Error(
          "Conflitto: il file è cambiato. Rileggilo prima di salvare.",
        );
      await this.preserve(name, file, before);
      await (
        await this.service(name)
      ).writeFile({ path: file, content, expectedMtimeMs: before?.mtimeMs });
      return this.read(name, file);
    };
    const pending = this.queue.then(task, task);
    this.queue = pending.catch(() => {});
    return pending;
  }
}
module.exports = { Workspaces, MAX_FILE };
