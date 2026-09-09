"use strict";
const { randomBytes, timingSafeEqual, createHmac } = require("node:crypto");
const COOKIE = "jenny_session";
function equal(a, b) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
class AuthHTTP {
  constructor(accounts, { secure = false } = {}) {
    this.accounts = accounts;
    this.secure = secure;
    this.csrfKey = randomBytes(32);
    this.attempts = new Map();
  }
  token(req) {
    const parts = (req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .filter((x) => x.startsWith(COOKIE + "="));
    return parts.length === 1 ? parts[0].slice(COOKIE.length + 1) : "";
  }
  cookie(token) {
    return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict${this.secure ? "; Secure" : ""}${token ? "" : "; Max-Age=0"}`;
  }
  session(req) {
    const token = this.token(req);
    return { token, user: this.accounts.currentUser(token) };
  }
  csrfFor(token) {
    return createHmac("sha256", this.csrfKey).update(token).digest("hex");
  }
  verify(req, token) {
    return (
      this.accounts.currentUser(token) &&
      equal(String(req.headers["x-jenny-csrf"] || ""), this.csrfFor(token))
    );
  }
  async handle(route, req, res, body, json) {
    const { token, user } = this.session(req);
    if (route === "/api/auth/login" && req.method === "POST") {
      const key = req.socket.remoteAddress || "local",
        now = Date.now();
      for (const [ip, entry] of this.attempts)
        if (entry.until <= now) this.attempts.delete(ip);
      const entry = this.attempts.get(key) || { count: 0, until: now + 60000 };
      if (
        entry.count >= 10 ||
        (!this.attempts.has(key) && this.attempts.size >= 1024)
      )
        return json({ error: "Troppi tentativi. Riprova tra un minuto." }, 429);
      entry.count++;
      this.attempts.set(key, entry);
      try {
        const result = await this.accounts.login(body.username, body.password);
        this.accounts.logout(token);
        this.attempts.delete(key);
        res.setHeader("Set-Cookie", this.cookie(result.token));
        return json({ user: result.user, csrf: this.csrfFor(result.token) });
      } catch {
        return json({ error: "Nome utente o password non validi." }, 401);
      }
    }
    if (route === "/api/auth/me" && req.method === "GET")
      return user
        ? json({ user, csrf: this.csrfFor(token) })
        : json(
            {
              error: "Accesso richiesto",
              setupRequired: this.accounts.allUsers().length === 0,
            },
            401,
          );
    if (!user) return json({ error: "Accesso richiesto" }, 401);
    if (req.method === "POST" && !this.verify(req, token))
      return json({ error: "Richiesta non autorizzata." }, 403);
    if (route === "/api/auth/logout" && req.method === "POST") {
      this.accounts.logout(token);
      res.setHeader("Set-Cookie", this.cookie(""));
      return json({ ok: true });
    }
    if (route === "/api/auth/password" && req.method === "POST") {
      await this.accounts.changePassword(
        token,
        body.currentPassword,
        body.newPassword,
      );
      res.setHeader("Set-Cookie", this.cookie(""));
      return json({ ok: true });
    }
    if (route.startsWith("/api/auth/users") && user.role !== "admin")
      return json({ error: "Solo amministratore." }, 403);
    if (route === "/api/auth/users" && req.method === "GET")
      return json({ users: this.accounts.listUsers(token) });
    if (route === "/api/auth/users" && req.method === "POST")
      return json(
        {
          user: await this.accounts.createUser(
            token,
            body.username,
            body.password,
          ),
        },
        201,
      );
    if (route === "/api/auth/users/disable" && req.method === "POST") {
      this.accounts.setDisabled(token, body.id, body.disabled);
      if (body.disabled) await this.onDisabled?.(body.id);
      return json({ ok: true });
    }
    return json({ error: "Non trovato." }, 404);
  }
}
module.exports = { AuthHTTP };
