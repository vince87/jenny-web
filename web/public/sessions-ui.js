"use strict";
async function listSessions() {
  const currentWorkspace = workspace, filter = $("chatSearch").value, archived = $("showArchived").checked;
  const { sessions } = await api("/sessions?" + new URLSearchParams({q:$("chatSearch").value,archived:$("showArchived").checked}));
  if (workspace !== currentWorkspace || filter !== $("chatSearch").value || archived !== $("showArchived").checked) return;
  $("sessions").replaceChildren();
  for (const s of sessions.filter((s) => s.workspace === workspace)) {
    const b = document.createElement("button");
    b.textContent = s.title;
    b.title = s.title;
    b.className = s.id === session?.id ? "active" : "";
    b.onclick = act(async () => {
      const ticket = ++sessionLoad;
      const current = workspace;
      const next = await api("/sessions/" + s.id);
      if (ticket !== sessionLoad || current !== workspace) return;
      session = next;
      renderKey = "";
      render();
      await listSessions();
    });
    $("sessions").append(b);
  }
}
async function connectEvents() {
  const id = session?.id || null;
  if (eventsId === id) return;
  clearTimeout(reconnectTimer);
  eventsController?.abort();
  eventsHealthy = false;
  eventsId = id;
  if (!id) return;
  const controller = new AbortController();
  eventsController = controller;
  try {
    const r = await fetch("/api/sessions/" + id + "/events", {
      headers: token ? { Authorization: "Bearer " + token } : {},
      signal: controller.signal,
    });
    if (!r.ok) throw new Error("Event stream unavailable");
    eventsHealthy = true;
    reconnectDelay = 2000;
    const reader = r.body.getReader(),
      decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let at;
        while ((at = buffer.indexOf("\n\n")) >= 0) {
          const event = buffer.slice(0, at);
          buffer = buffer.slice(at + 2);
          const line = event.split("\n").find((l) => l.startsWith("data: "));
          if (!line || session?.id !== id) continue;
          const data = JSON.parse(line.slice(6));
          if (data.delta) {
            session.partial = data.partial;
            $("partial").hidden = !data.partial;
            $("partialText").textContent = data.partial;
          } else {
            const changed = session.status !== data.status;
            session = data;
            render();
            if (changed) {
              listSessions().catch(() => {});
              listFiles().catch(() => {});
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  } catch (e) {
    if (!controller.signal.aborted)
      notice(
        t(
          "Aggiornamento in tempo reale interrotto: uso il controllo periodico.",
        ),
      );
  } finally {
    if (eventsController === controller) {
      eventsHealthy = false;
      if (!controller.signal.aborted && session?.id === id) {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          if (session?.id === id) {
            eventsId = null;
            connectEvents();
          }
        }, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 30000);
      }
    }
  }
}
