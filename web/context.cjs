"use strict";
// Deliberately an estimate, not a tokenizer. Drop only complete old user turns.
function budgetContext(system, messages, tools, numCtx, numPredict) {
  const turns = [];
  for (const m of messages) {
    if (m.role === "user" || !turns.length) turns.push([]);
    turns.at(-1).push(m);
  }
  const maxInput = numCtx - numPredict - 512;
  const estimate = (items) =>
    Math.ceil(Buffer.byteLength(JSON.stringify([system, ...items])) / 3) +
    Math.ceil(Buffer.byteLength(JSON.stringify(tools || [])) / 3);
  let droppedTurns = 0;
  while (turns.length > 1 && estimate(turns.flat()) > maxInput) {
    turns.shift();
    droppedTurns++;
  }
  const selected = turns.flat(),
    estimatedTokens = estimate(selected);
  if (estimatedTokens > maxInput)
    throw new Error(
      "Il turno supera il budget di contesto stimato. Chiedi letture più brevi o aumenta OLLAMA_NUM_CTX. La chat completa resta salvata.",
    );
  return {
    messages: selected,
    info: { droppedTurns, estimatedTokens, maxInput, numCtx },
  };
}
function normalizeHistory(messages) {
  const calls = new Set(
    messages.flatMap((m) => (m.tool_calls || []).map((c) => c.id)),
  );
  return messages.map((m) => {
    if (m.role === "tool" && !calls.has(m.tool_call_id))
      return {
        role: "assistant",
        content:
          "Risultato storico di un tool (chiamata non disponibile nella vecchia sessione): " +
          m.content,
      };
    if (Array.isArray(m.tool_calls) && !m.tool_calls.length) {
      const { tool_calls, ...rest } = m;
      return rest;
    }
    return m;
  });
}
module.exports = { budgetContext, normalizeHistory };
