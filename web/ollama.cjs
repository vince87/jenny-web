"use strict";
const { randomUUID } = require("node:crypto");
const { LocalProvider } = require("./provider.cjs");
class OllamaProvider extends LocalProvider {
  constructor(options) {
    super({
      ...options,
      baseURL: options.baseURL.replace(/\/+$/, "").replace(/\/(v1|api)$/, ""),
    });
    this.kind = "ollama";
    this.settings = {
      context: 8192,
      predict: 2048,
      keepAlive: "10m",
      temperature: 0.2,
      think: "auto",
      ...options.ollama,
    };
    const o = this.settings;
    o.think = String(o.think);
    if (
      !Number.isInteger(o.context) ||
      o.context < 2048 ||
      o.context > 131072 ||
      !Number.isInteger(o.predict) ||
      o.predict < 128 ||
      o.predict > o.context / 2 ||
      !Number.isFinite(o.temperature) ||
      o.temperature < 0 ||
      o.temperature > 2 ||
      !/^(0|[0-9]+(?:s|m|h))$/.test(String(o.keepAlive)) ||
      !["auto", "true", "false", "low", "medium", "high"].includes(
        String(o.think),
      )
    )
      throw new Error(
        "Configurazione Ollama non valida. Controlla contesto, output, temperatura, keep-alive e thinking.",
      );
    this.metadata = new Map();
    this.gate = Promise.resolve();
  }
  async info(model, signal) {
    const cached = this.metadata.get(model);
    if (cached && Date.now() - cached.at < 60000) return cached.value;
    const data = await this.boundedJSON(
      await this.connect(
        "/api/show",
        { model },
        signal || AbortSignal.timeout(15000),
      ),
    );
    const value = {
      capabilities: Array.isArray(data.capabilities) ? data.capabilities : [],
      details: data.details || {},
    };
    this.metadata.set(model, { at: Date.now(), value });
    return value;
  }
  async request(endpoint) {
    if (endpoint === "/models") {
      const r = await super.request("/api/tags");
      return { data: (r.models || []).map((m) => ({ id: m.name })) };
    }
    return super.request(endpoint);
  }
  async status(model) {
    const results = await Promise.allSettled([
      super.request("/api/version"),
      super.request("/api/ps"),
      model ? this.info(model) : Promise.resolve(null),
    ]);
    return {
      provider: "ollama",
      settings: this.settings,
      version: results[0].value?.version || null,
      running: (results[1].value?.models || []).map((m) => ({
        name: m.name,
        size: m.size,
        sizeVRAM: m.size_vram,
        contextLength: m.context_length,
        expiresAt: m.expires_at,
      })),
      model: results[2].value || null,
      warnings: results
        .filter((r) => r.status === "rejected")
        .map(() => "Una verifica Ollama non è disponibile."),
    };
  }
  async generate(body, signal, onDelta = () => {}) {
    // One inference at a time from this Jenny instance: avoid competing loads/KV caches.
    const previous = this.gate;
    let release;
    const gate = new Promise((r) => (release = r));
    this.gate = previous.then(() => gate);
    let abort;
    try {
      await Promise.race([
        previous,
        new Promise((_, reject) => {
          abort = () => reject(new DOMException("Aborted", "AbortError"));
          signal.addEventListener("abort", abort, { once: true });
          if (signal.aborted) abort();
        }),
      ]);
      signal.throwIfAborted();
      return await this.nativeGenerate(body, signal, onDelta);
    } catch (e) {
      throw this.error(e);
    } finally {
      signal.removeEventListener("abort", abort);
      release();
    }
  }
  async nativeGenerate(body, signal, onDelta) {
    const names = new Map(
      body.messages.flatMap((m) =>
        (m.tool_calls || []).map((c) => [c.id, c.function.name]),
      ),
    );
    const messages = body.messages.map((m) => ({
      role: m.role,
      content: m.content || "",
      ...(m.thinking ? { thinking: m.thinking } : {}),
      ...(m.role === "tool"
        ? { tool_name: names.get(m.tool_call_id) || "" }
        : {}),
      ...(m.tool_calls
        ? {
            tool_calls: m.tool_calls.map((c) => ({
              function: {
                name: c.function.name,
                arguments: JSON.parse(c.function.arguments),
              },
            })),
          }
        : {}),
    }));
    const o = body.jennySettings || this.settings;
    const request = {
      model: body.model,
      messages,
      stream: this.streaming,
      keep_alive: o.keepAlive,
      options: {
        num_ctx: o.context,
        num_predict: o.predict,
        temperature: o.temperature,
      },
      ...(body.tools ? { tools: body.tools } : {}),
    };
    // Do not guess capabilities: old Ollama versions can lack /show metadata.
    let info;
    try {
      info = await this.info(body.model, signal);
    } catch {
      info = null;
    }
    if (
      body.tools &&
      info?.capabilities.length &&
      !info.capabilities.includes("tools")
    )
      throw new Error(
        "Questo modello Ollama non dichiara supporto tool. Disattiva Agente oppure scegli un modello con tools.",
      );
    if (o.think !== "auto" && info?.capabilities.includes("thinking"))
      request.think = ["true", "false"].includes(String(o.think))
        ? o.think === "true"
        : o.think;
    const response = await this.connect("/api/chat", request, signal);
    let content = "",
      thinking = "",
      tools = [],
      final = null,
      bytes = 0,
      buffer = "";
    const decoder = new TextDecoder();
    const consume = (frame) => {
      if (frame.error)
        throw new Error("Ollama: " + String(frame.error).slice(0, 300));
      if (frame.message?.content) {
        content += frame.message.content;
      }
      if (frame.message?.thinking) {
        thinking += frame.message.thinking;
      }
      if (frame.message?.content || frame.message?.thinking)
        onDelta(content, thinking);
      if (frame.message?.tool_calls) tools.push(...frame.message.tool_calls);
      if (tools.length > 8)
        throw new Error("Troppi tool nella risposta Ollama.");
      if (frame.done) final = frame;
    };
    if (!this.streaming) {
      consume(await this.boundedJSON(response));
    } else {
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > 2 * 1024 * 1024)
          throw new Error("Risposta Ollama troppo grande.");
        buffer += decoder.decode(chunk, { stream: true });
        let at;
        while ((at = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, at).trim();
          buffer = buffer.slice(at + 1);
          if (line) consume(JSON.parse(line));
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) consume(JSON.parse(buffer));
    }
    if (!final)
      throw new Error(
        "Streaming Ollama interrotto. Nessun tool parziale è stato eseguito.",
      );
    if (final.done_reason === "length" && tools.length)
      throw new Error(
        "Ollama ha esaurito il limite di output durante i tool. Nessuna modifica eseguita.",
      );
    const message = {
      role: "assistant",
      content,
      ...(thinking ? { thinking } : {}),
      ...(tools.length
        ? {
            tool_calls: tools.map((c) => ({
              id: randomUUID(),
              type: "function",
              function: {
                name: c.function?.name,
                arguments: JSON.stringify(c.function?.arguments),
              },
            })),
          }
        : {}),
    };
    return {
      choices: [{ message }],
      usage: {
        prompt_tokens: final.prompt_eval_count || 0,
        completion_tokens: final.eval_count || 0,
        total_tokens: (final.prompt_eval_count || 0) + (final.eval_count || 0),
      },
      ollama: {
        loadMs: (final.load_duration || 0) / 1e6,
        tokensPerSecond:
          final.eval_duration > 0
            ? Math.round((final.eval_count / final.eval_duration) * 1e10) / 10
            : 0,
        doneReason: final.done_reason,
      },
    };
  }
}
module.exports = { OllamaProvider };
