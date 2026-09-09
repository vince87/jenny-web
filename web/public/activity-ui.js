"use strict";
function paintActivity() {
  const active = session?.status === "running" || sending;
  $("activity").hidden = !active;
  if (!active) return;
  const label =
    session?.phase === "searching-web"
      ? "Ricerca sul web in corso…"
      : session?.phase === "thinking"
        ? "Il modello sta pensando…"
        : session?.phase === "writing"
          ? "Jenny sta scrivendo…"
          : "In attesa del modello…";
  const seconds = session?.startedAt
    ? Math.max(
        0,
        Math.floor((Date.now() - Date.parse(session.startedAt)) / 1000),
      )
    : 0;
  $("activityLabel").textContent = t(label) + " · " + seconds + " s";
  $("liveThinking").hidden = !session?.partialThinking;
  $("liveThinkingText").textContent = session?.partialThinking || "";
}
setInterval(() => paintActivity(), 1000);
