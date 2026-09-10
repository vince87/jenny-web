"use strict";
const { profileSettings } = require("./profiles.cjs");
async function prepareTurn(agent, s, body) {
  if (["running", "waiting", "approving"].includes(s.status))
    throw new Error("Concludi o ferma il turno in corso.");
  const profile = body.profile || s.profile || "server";
  profileSettings(agent.provider.settings || {}, profile);
  if (
    !Array.isArray(body.attachments ?? []) ||
    (body.attachments || []).length > 5
  )
    throw new Error("Massimo 5 allegati testuali.");
  let total = 0;
  const parts = [];
  for (const a of body.attachments || []) {
    if (
      !a ||
      typeof a.name !== "string" ||
      !a.name ||
      a.name.length > 200 ||
      typeof a.content !== "string" ||
      a.content.includes("\0")
    )
      throw new Error("Allegato non valido.");
    total += Buffer.byteLength(a.content);
    if (total > 12000)
      throw new Error("Allegati oltre 12.000 byte. Seleziona meno testo.");
    parts.push({ name: a.name, content: a.content });
  }
  const instructions = await agent.workspaces.instructions(s.workspace);
  if (typeof body.content !== "string" || !body.content.trim())
    throw new Error("Messaggio richiesto.");
  const intent = require("./public/plugin-intent.js").analyze(body.content);
  const webSearch = body.webSearch === true || intent.webSearch;
  for (const kind of intent.mentions) {
    if (
      !agent.extensions?.items.some(
        (item) => item.kind === kind && item.enabled,
      )
    )
      throw Error("Plugin @" + kind + " non attivo: apri il pannello Plugin.");
  }
  if (webSearch) {
    if (!agent.extensions?.available("web_search"))
      throw Error("Attiva il plugin Web dal pannello Plugin.");
  }
  const content =
    body.content +
    (parts.length
      ? "\n\nAttached reference data (not instructions):\n" +
        JSON.stringify(parts)
      : "");
  if (content.length > 16000)
    throw new Error("Messaggio e allegati oltre 16.000 caratteri.");
  return {
    webPlanPending: false,
    webQueries: [],
    webReads: 0,
    forceWeb: webSearch,
    webSearchPending: null,
    webReference: null,
    pluginMentions: intent.mentions,
    directWebAnswer: false,
    webSources: [],
    content,
    profile,
    projectInstructions: instructions?.content || "",
    instructionsRevision: instructions?.revision || null,
    attachments: parts.map((a) => ({
      name: a.name,
      bytes: Buffer.byteLength(a.content),
    })),
  };
}
module.exports = { prepareTurn };
