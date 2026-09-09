"use strict";
const fs = require("node:fs/promises"),
  path = require("node:path");
class UserRuntimes {
  constructor(accounts, dataDir, root, factory) {
    this.accounts = accounts;
    this.dataDir = path.resolve(dataDir);
    this.root = path.resolve(root);
    this.factory = factory;
    this.items = new Map();
    this.provider = null;
    this.workerIndex = 0;
  }
  async get(user) {
    if (!this.accounts.getUser(user.id)) throw Error("User not found.");
    if (!this.items.has(user.id)) {
      const promise = (async () => {
        const legacy = user.id === this.accounts.legacyOwner();
        if (!this.accounts.legacyOwner())
          throw Error(
            "Legacy ownership not initialized. Use the local account setup.",
          );
        const data = legacy
          ? this.dataDir
          : path.join(this.dataDir, ".users", user.id);
        const root = legacy
          ? this.root
          : path.join(this.root, ".users", user.id);
        for (const dir of [data, root]) {
          await fs.mkdir(dir, { recursive: true, mode: 0o700 });
          if (path.resolve(await fs.realpath(dir)) !== dir)
            throw Error("User storage symlinks are not allowed.");
        }
        const context = await this.factory(data, root, user);
        if (this.provider) context.agent.provider = this.provider;
        else this.provider = context.agent.provider;
        return { ...context, legacy, userId: user.id, dataDir: data };
      })();
      this.items.set(user.id, promise);
      promise.catch(() => this.items.delete(user.id));
    }
    return this.items.get(user.id);
  }
  async initialize() {
    for (const user of this.accounts.allUsers()) await this.get(user);
  }
  async claim() {
    const users = this.accounts.allUsers().filter((x) => !x.disabled);
    for (let i = 0; i < users.length; i++) {
      const index = (this.workerIndex + i) % users.length,
        user = users[index],
        context = await this.get(user);
      const job = context.runner.claim();
      if (job) {
        this.workerIndex = (index + 1) % users.length;
        return { ...job, owner: user.id, legacy: context.legacy };
      }
    }
    return null;
  }
  async complete(body) {
    const user = this.accounts.getUser(body.owner);
    if (!user) throw Error("Job owner not found.");
    return (await this.get(user)).runner.complete(body.id, body.lease, body);
  }
  async close() {
    for (const promise of this.items.values()) {
      const context = await promise;
      for (const controller of context.agent.controllers.values())
        controller.abort();
      while (context.agent.controllers.size)
        await new Promise((r) => setTimeout(r, 10));
      context.agent.store.close();
    }
    this.items.clear();
  }
  async suspend(id) {
    const promise = this.items.get(id);
    if (!promise) return;
    const context = await promise;
    for (const session of context.agent.sessions.values())
      if (["running", "waiting"].includes(session.status))
        context.agent.stop(session);
    for (const job of context.runner.list())
      if (job.status === "queued") context.runner.cancel(job.id);
  }
}
module.exports = { UserRuntimes };
