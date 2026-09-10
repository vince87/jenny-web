"use strict";
const MAX_RESPONSE = 2 * 1024 * 1024;
class LocalProvider {
  constructor({ baseURL, apiKey = "", timeout = 120000, streaming = true }) {
    this.baseURL = baseURL.replace(/\/+$/, "");
    this.apiKey = apiKey;
    const u = new URL(this.baseURL);
    if (
      !["http:", "https:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      u.search ||
      u.hash
    )
      throw new Error("LLM_BASE_URL non valido.");
    if (!Number.isInteger(timeout) || timeout < 100 || timeout > 1800000)
      throw new Error("LLM_TIMEOUT_MS deve essere tra 100 e 1800000.");
    this.timeout = timeout;
    this.streaming = streaming;
  }
  async connect(endpoint, body, signal) {
    const deadline = AbortSignal.timeout(body ? this.timeout : 15000);
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
    const response = await fetch(this.baseURL + endpoint, {
      method: body ? "POST" : "GET",
      signal: combined,
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { Authorization: "Bearer " + this.apiKey } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(
        `Endpoint LLM: HTTP ${response.status}. Verifica modello, supporto tool/streaming e configurazione.`,
      );
    }
    return response;
  }
  async boundedJSON(response) {
    let size = 0;
    const chunks = [];
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > MAX_RESPONSE) throw new Error("Risposta LLM troppo grande.");
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  }
  async request(endpoint) {
    try {
      return await this.boundedJSON(await this.connect(endpoint));
    } catch (e) {
      throw this.error(e);
    }
  }
  error(e) {
    if (e.name === "TimeoutError")
      return new Error("Timeout del modello locale.");
    if (e.name === "AbortError") return new Error("Generazione fermata.");
    if (e instanceof TypeError && e.message === "fetch failed")
      return new Error(
        "Endpoint LLM non raggiungibile. Controlla indirizzo, porta e rete Docker.",
      );
    return e;
  }
  async generate(body, signal, onDelta = () => {}) {
    try {
      const response = await this.connect(
        "/chat/completions",
        { ...body, stream: this.streaming },
        signal,
      );
      if (!response.headers.get("content-type")?.includes("text/event-stream"))
        return await this.boundedJSON(response);
      const decoder = new TextDecoder();
      let buffer = "",
        bytes = 0,
        done = false,
        finished = false,
        content = "",
        usage;
      const tools = new Map();
      const consume = (event) => {
        const data = event
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data) return;
        if (data.trim() === "[DONE]") {
          done = true;
          return;
        }
        const frame = JSON.parse(data);
        if (frame.error)
          throw new Error(
            "Il provider ha restituito un errore durante lo streaming.",
          );
        if (frame.usage) usage = frame.usage;
        const choice = frame.choices?.find((c) => (c.index ?? 0) === 0);
        if (!choice) return;
        if (choice.finish_reason) finished = true;
        const delta = choice.delta || {};
        if (typeof delta.content === "string") {
          content += delta.content;
          onDelta(content);
        }
        for (const part of delta.tool_calls || []) {
          const index = part.index;
          if (!Number.isInteger(index) || index < 0 || index > 7)
            throw new Error("Indice tool streaming non valido.");
          const call = tools.get(index) || {
            id: "",
            type: "function",
            function: { name: "", arguments: "" },
          };
          if (part.id) call.id += part.id;
          if (part.function?.name) call.function.name += part.function.name;
          if (part.function?.arguments)
            call.function.arguments += part.function.arguments;
          tools.set(index, call);
        }
      };
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > MAX_RESPONSE)
          throw new Error("Risposta LLM troppo grande.");
        buffer += decoder.decode(chunk, { stream: true });
        // Normalize CRLF after concatenation so a CR/LF split across chunks is safe.
        buffer = buffer.replace(/\r\n/g, "\n");
        let boundary;
        while ((boundary = buffer.indexOf("\n\n")) >= 0) {
          consume(buffer.slice(0, boundary));
          buffer = buffer.slice(boundary + 2);
        }
        if (done) break;
      }
      buffer += decoder.decode();
      if (buffer.trim()) consume(buffer);
      if (!done && !finished)
        throw new Error(
          "Streaming interrotto prima del completamento. Nessun tool parziale è stato eseguito.",
        );
      const message = {
        role: "assistant",
        content,
        ...(tools.size
          ? {
              tool_calls: [...tools.entries()]
                .sort((a, b) => a[0] - b[0])
                .map(([, v]) => v),
            }
          : {}),
      };
      return { choices: [{ message }], usage };
    } catch (e) {
      throw this.error(e);
    }
  }
}
module.exports = { LocalProvider };
