"use strict";
const locale = JennyI18n.create(localStorage.getItem("jenny-language") || "it");
const t = (key) => locale.t(key);
const $ = (id) => document.getElementById(id);
const fileGate = new JennyState.RequestGate();
let token = sessionStorage.getItem("jenny-token") || "";
let workspace = localStorage.getItem("jenny-workspace") || "",
  session = null,
  directory = "",
  opened = null,
  dirty = false,
  renderKey = "",
  polling = false,
  nameMode = "",
  noticeTimer,
  fileLoad = 0,
  sessionLoad = 0;
let lastConfig = null,
  draftKey = null,
  reconnectTimer = null,
  reconnectDelay = 2000;
let sending = false,
  approvalKey = "",
  eventsId = null,
  eventsController = null,
  eventsHealthy = false,
  searchTicket = 0;
JennyI18n.apply(document, locale);
const welcome = $("messages").innerHTML;
function notice(message) {
  $("notice").textContent = message;
  $("notice").hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => ($("notice").hidden = true), 9000);
}
async function api(route, body) {
  const response = await fetch("/api" + route, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Accept-Language": locale.language,
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !$("settings").open)
      $("settings").showModal();
    throw new Error(data.error || t("Errore del server."));
  }
  return data;
}
const act = (fn) => async (event) => {
  try {
    await fn(event);
  } catch (e) {
    notice(t(e.message));
  }
};
function canDiscard() {
  return (
    !dirty ||
    confirm(t("Il file contiene modifiche non salvate. Vuoi scartarle?"))
  );
}
function resetEditor() {
  fileLoad++;
  fileGate.invalidate();
  opened = null;
  dirty = false;
  $("editor").value = "";
  $("editor").disabled = true;
  $("fileName").textContent = t("Nessun file aperto");
  $("saveFile").disabled = true;
  updateEditor();
}
function query(file = "") {
  return (
    "?workspace=" +
    encodeURIComponent(workspace) +
    "&path=" +
    encodeURIComponent(file)
  );
}
async function listFiles() {
  if (!workspace) return;
  const current = workspace,
    folder = directory;
  const data = await api("/files" + query(folder));
  if (workspace !== current || directory !== folder) return;
  $("fileCount").textContent = data.entries.length + t(" elementi");
  $("folder").textContent = "/" + directory;
  $("files").replaceChildren();
  for (const entry of data.entries) {
    const b = document.createElement("button");
    b.textContent = (entry.kind === "directory" ? "▸  " : "·  ") + entry.name;
    b.title = entry.relPath;
    b.onclick = act(async () => {
      if (entry.kind === "directory") {
        directory = entry.relPath;
        await listFiles();
      } else await openFile(entry.relPath);
    });
    $("files").append(b);
  }
  if (!data.entries.length) {
    const p = document.createElement("p");
    p.className = "empty-files";
    p.textContent = t(
      "Cartella vuota. Crea un file oppure chiedi a Jenny di iniziare.",
    );
    $("files").append(p);
  }
  if (data.truncated)
    notice(t("Elenco limitato. Apri una sottocartella per continuare."));
}
async function openFile(file) {
  if (!canDiscard()) return;
  const ticket = fileGate.begin(workspace),
    current = workspace;
  const data = await api("/file" + query(file));
  if (!fileGate.accepts(ticket,workspace)) return;
  opened = { ...data, workspace };
  dirty = false;
  $("editor").value = data.content;
  $("editor").disabled = false;
  $("fileName").textContent = data.path;
  $("saveFile").disabled = true;
  updateEditor();
}
function textNode(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}
function render() {
  syncDraft();
  paintWorkbenchState();
  if (workspace) localStorage.setItem("jenny-workspace", workspace);
  if (session) localStorage.setItem("jenny-session:" + workspace, session.id);
  const active = ["running", "approving", "waiting"].includes(session?.status);
  connectEvents();
  $("partial").hidden = !session?.partial;
  $("partialText").textContent = session?.partial || "";
  $("exportChat").disabled = !session;
  $("renameChat").disabled = !session;
  const m = session?.metrics,
    c = session?.context;
  $("metrics").textContent = m
    ? [
        m.ollama?.tokensPerSecond
          ? m.ollama.tokensPerSecond + " tok/s"
          : (m.durationMs / 1000).toFixed(1) + " s",
        m.usage ? m.usage.completion_tokens + " token" : "",
        c ? "~" + c.estimatedTokens + "/" + c.maxInput + t(" contesto") : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  $("metrics").title = c
    ? t(
        "Stima, non tokenizzazione esatta. Turni precedenti esclusi dal prompt: ",
      ) +
      c.droppedTurns +
      t(". La chat completa resta salvata.")
    : "";
  $("send").disabled = active || sending || !!session?.archived;
  $("stop").hidden = !active;
  $("stop").disabled = session?.status === "approving";
  $("chatTitle").textContent = session?.title || t("Il tuo spazio di lavoro");
  const states = {
    idle: t("Pronto"),
    running: t("Jenny sta lavorando…"),
    waiting: t("In attesa della tua approvazione"),
    approving: t("Salvataggio in corso…"),
    error: t("Turno interrotto"),
  };
  $("chatState").textContent =
    states[session?.status] || t("Pronto per iniziare");
  const p = session?.pending;
  $("approval").hidden = !p;
  $("batchChoices").hidden = !p?.files;
  if (p && approvalKey !== p.id) {
    approvalKey = p.id;
    paintBatch(p);
    renderDiff(p);
    $("approvalPath").textContent = p.path;
    $("before").textContent = p.before === null ? t("(Nuovo file)") : p.before;
    $("after").textContent = p.after;
  }
  $("approve").disabled = session?.status !== "waiting";
  $("deny").disabled = session?.status !== "waiting";
  const key = [
    session?.id,
    session?.revision,
    session?.messages?.length,
    session?.error,
  ].join(":");
  if (key === renderKey) return;
  renderKey = key;
  const area = $("messages");
  const bottom = area.scrollHeight - area.scrollTop - area.clientHeight < 90;
  if (!session?.messages.length) {
    area.innerHTML = welcome;
    JennyI18n.apply(area, locale);
    return;
  }
  area.replaceChildren();
  for (const m of session.messages) {
    if (m.role === "tool") {
      const box = textNode("div", "", "tool-event");
      const detail = document.createElement("details");
      let result;
      try {
        result = JSON.parse(m.content);
      } catch {
        result = {};
      }
      const call = session.messages
        .flatMap((x) => x.tool_calls || [])
        .find((c) => c.id === m.tool_call_id);
      detail.append(
        textNode(
          "summary",
          `${result.error ? t("Errore") : result.denied ? t("Rifiutato") : t("Completato")} · ${call?.function.name || "tool"}`,
        ),
        textNode("pre", m.content),
      );
      box.append(detail);
      area.append(box);
      continue;
    }
    if (m.content) {
      const div = textNode("article", "", "message " + m.role);
      div.append(
        textNode("div", m.role === "user" ? t("TU") : "JENNY", "role"),
        renderContent(m.content),
      );
      area.append(div);
    }
    for (const c of m.tool_calls || [])
      area.append(
        textNode("div", t("Richiesta · ") + c.function.name, "tool-event"),
      );
  }
  if (session.error)
    area.append(textNode("div", t(session.error), "tool-event"));
  if (bottom) area.scrollTop = area.scrollHeight;
}
function paintConfig(config) {
  $("endpoint").textContent =
    (config.provider === "ollama"
      ? t("Ollama nativo · ")
      : "OpenAI-compatible · ") + config.baseURL;
  $("providerSettings").hidden = config.provider !== "ollama";
  if (config.ollama)
    $("ollamaConfig").textContent =
      t("Contesto ") +
      config.ollama.context +
      " · output " +
      config.ollama.predict +
      t(" · memoria ") +
      config.ollama.keepAlive;
}
async function initialize() {
  eventsController?.abort();
  eventsId = null;
  eventsHealthy = false;
  const config = await api("/config");
  lastConfig = config;
  $("connection").textContent = t("Server connesso");
  paintConfig(config);
  if (!$("model").value) $("model").value = config.model;
  const data = await api("/workspaces");
  $("workspace").replaceChildren();
  for (const name of data.workspaces) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    $("workspace").append(option);
  }
  if (!data.workspaces.includes(workspace))
    workspace = data.workspaces[0] || "";
  $("workspace").value = workspace;
  if (!session && workspace) {
    const id = localStorage.getItem("jenny-session:" + workspace);
    if (id) {
      try {
        const restored = await api("/sessions/" + id);
        if (restored.workspace === workspace) {
          session = restored;
          if (restored.model) $("model").value = restored.model;
        }
      } catch {
        localStorage.removeItem("jenny-session:" + workspace);
      }
    }
  }
  await Promise.all([listFiles(), listSessions()]);
  render();
  api("/models")
    .then(({ models }) => {
      $("models").replaceChildren();
      for (const id of models) {
        const o = document.createElement("option");
        o.value = id;
        $("models").append(o);
      }
      if (!$("model").value && models.length) $("model").value = models[0];
      $("connection").textContent = t("LLM raggiungibile");
      providerStatus();
    })
    .catch((e) => {
      $("connection").textContent = t("LLM non raggiungibile");
      notice(t(e.message));
    });
}
$("settingsButton").onclick = () => {
  $("token").value = token;
  $("settings").showModal();
};
$("closeSettings").onclick = () => $("settings").close();
$("settingsForm").onsubmit = act(async (e) => {
  e.preventDefault();
  token = $("token").value.trim();
  sessionStorage.setItem("jenny-token", token);
  $("settings").close();
  await initialize();
});
$("workspace").onchange = act(async () => {
  if (!canDiscard()) {
    $("workspace").value = workspace;
    return;
  }
  workspace = $("workspace").value;
  directory = "";
  session = null;
  sessionLoad++;
  renderKey = "";
  resetEditor();
  render();
  await Promise.all([listFiles(), listSessions()]);
});
$("newChat").onclick = act(async () => {
  if (!workspace) throw new Error(t("Scegli un workspace."));
  const current = workspace,
    ticket = ++sessionLoad;
  const next = await api("/sessions", {
    workspace: current,
    language: locale.language,
  });
  if (workspace !== current || ticket !== sessionLoad) return;
  session = next;
  renderKey = "";
  render();
  await listSessions();
  $("prompt").focus();
});
$("composer").onsubmit = act(async (e) => {
  e.preventDefault();
  const content = $("prompt").value.trim();
  if (!content || sending) return;
  sending = true;
  $("prompt").readOnly = true;
  $("send").disabled = true;
  const current = workspace,
    ticket = sessionLoad,
    model = $("model").value.trim(),
    useTools = $("useTools").checked;
  let target = session;
  try {
    if (!target)
      target = await api("/sessions", {
        workspace: current,
        language: locale.language,
      });
    const next = await api("/sessions/" + target.id + "/message", {
      content,
      model,
      useTools,
      language: locale.language,
      profile: $("profile").value,
      attachments: currentAttachments(),
    });
    if (workspace === current && sessionLoad === ticket) {
      clearAttachments();
      session = next;
      $("prompt").value = "";
      if (draftKey) sessionStorage.removeItem(draftKey);
      render();
    }
    await listSessions();
  } finally {
    sending = false;
    $("prompt").readOnly = false;
    render();
  }
});
$("prompt").onkeydown = (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    $("composer").requestSubmit();
  }
};
$("messages").onclick = (e) => {
  const button = e.target.closest("[data-prompt]");
  if (button) {
    $("prompt").value = button.dataset.prompt;
    $("prompt").focus();
  }
};
$("stop").onclick = act(async () => {
  const id = session.id;
  const next = await api("/sessions/" + id + "/stop", {});
  if (session?.id === id) {
    session = next;
    render();
  }
});
for (const [id, allowed] of [
  ["approve", true],
  ["deny", false],
])
  $(id).onclick = act(async () => {
    const current = session.id;
    const file = session.pending.path;
    $("approve").disabled = true;
    $("deny").disabled = true;
    try {
      const next = await api("/sessions/" + current + "/approval", {
        id: session.pending.id,
        allowed,
        ...(session.pending.files ? {decisions:session.pending.files.map((_,i)=>allowed && !!$("batch-"+i)?.checked)} : {}),
      });
      if (session?.id === current) {
        session = next;
        render();
      }
      await listFiles();
      if (
        allowed &&
        opened?.path === file &&
        opened.workspace === workspace &&
        !dirty
      )
        await openFile(file);
    } finally {
      render();
    }
  });
$("refreshFiles").onclick = act(listFiles);
$("up").onclick = act(async () => {
  directory = directory.split("/").slice(0, -1).join("/");
  await listFiles();
});
$("editor").oninput = () => {
  dirty = $("editor").value !== opened.content;
  $("saveFile").disabled = !dirty;
  $("fileName").textContent = opened.path + (dirty ? " •" : "");
  updateEditor();
};
$("saveFile").onclick = act(async () => {
  const current = opened,
    content = $("editor").value;
  $("saveFile").disabled = true;
  try {
    const saved = await api("/file", {
      workspace: current.workspace,
      path: current.path,
      content,
      revision: current.revision,
    });
    if (opened === current) {
      opened = { ...saved, workspace: current.workspace };
      dirty = $("editor").value !== content;
      $("fileName").textContent = saved.path + (dirty ? " •" : "");
    }
    notice(t("File salvato."));
    await listFiles();
  } finally {
    $("saveFile").disabled = !dirty;
  }
});
function nameDialog(mode) {
  nameMode = mode;
  $("nameTitle").textContent =
    mode === "workspace" ? t("Nuovo workspace") : t("Nuovo file");
  $("nameLabel").textContent =
    mode === "workspace"
      ? t("Nome (lettere, numeri, - e _)")
      : t("Percorso relativo, per esempio src/app.js");
  $("newName").value = mode === "file" && directory ? directory + "/" : "";
  $("nameDialog").showModal();
  $("newName").focus();
}
$("addWorkspace").onclick = () => nameDialog("workspace");
$("newFile").onclick = () => {
  if (canDiscard()) nameDialog("file");
};
$("cancelName").onclick = () => $("nameDialog").close();
$("nameForm").onsubmit = act(async (e) => {
  e.preventDefault();
  const name = $("newName").value.trim();
  if (nameMode === "rename") {
    const id = session.id;
    const next = await api("/sessions/" + id + "/rename", { title: name });
    if (session?.id === id) {
      session = next;
      render();
    }
    await listSessions();
  } else if (nameMode === "workspace") {
    await api("/workspaces", { name });
    if (canDiscard()) {
      workspace = name;
      session = null;
      sessionLoad++;
      directory = "";
      resetEditor();
      render();
    }
    await initialize();
  } else {
    await api("/file", { workspace, path: name, content: "", revision: null });
    await listFiles();
    await openFile(name);
  }
  $("nameDialog").close();
});
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
setInterval(async () => {
  if (
    polling ||
    eventsHealthy ||
    !session ||
    !["running", "waiting", "approving"].includes(session.status) ||
    document.hidden
  )
    return;
  polling = true;
  const id = session.id;
  try {
    const next = await api("/sessions/" + id);
    if (session?.id === id) {
      const changed = session.status !== next.status;
      session = next;
      render();
      if (changed) {
        await listSessions();
        await listFiles();
      }
    }
  } catch (e) {
    notice(t(e.message));
  } finally {
    polling = false;
  }
}, 1200);
initialize().catch((e) => {
  $("connection").textContent = t("Accesso richiesto");
  notice(t(e.message));
});

function renderContent(content) {
  const container = textNode("div", "", "content");
  const pieces = content.split(/```([^\n`]*)\n([\s\S]*?)(?:```|$)/g);
  for (let i = 0; i < pieces.length; i += 3) {
    if (pieces[i])
      for (const paragraph of pieces[i].split(/\n{2,}/)) {
        const heading = paragraph.match(/^#{1,3}\s+(.+)$/);
        container.append(
          textNode(heading ? "h3" : "p", heading ? heading[1] : paragraph),
        );
      }
    if (pieces[i + 2] !== undefined) {
      const box = textNode("div", "", "code-block"),
        toolbar = textNode("div", "", "code-toolbar"),
        button = textNode("button", t("Copia"));
      button.type = "button";
      button.onclick = act(async () => {
        await copyText(pieces[i + 2]);
        notice(t("Codice copiato."));
      });
      toolbar.append(textNode("span", pieces[i + 1] || t("codice")), button);
      const code = document.createElement("code");
      code.innerHTML = JennyView.highlight(pieces[i + 2]);
      box.append(toolbar, code);
      container.append(box);
    }
  }
  return container;
}
function renderDiff(p) {
  const rows = JennyView.diff(p.before, p.after);
  $("diffCount").textContent =
    "+" +
    rows.filter((r) => r.kind === "add").length +
    " / −" +
    rows.filter((r) => r.kind === "remove").length;
  $("unifiedDiff").replaceChildren();
  // Collapse long unchanged runs, preserving three lines around changes.
  let skipped = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const nearby = rows
      .slice(Math.max(0, i - 3), i + 4)
      .some((x) => x.kind !== "same");
    if (r.kind === "same" && !nearby) {
      skipped++;
      continue;
    }
    if (skipped) {
      $("unifiedDiff").append(
        textNode(
          "div",
          "  … " + skipped + t(" righe invariate"),
          "diff-line same",
        ),
      );
      skipped = 0;
    }
    $("unifiedDiff").append(
      textNode(
        "div",
        (r.kind === "add" ? "+ " : r.kind === "remove" ? "− " : "  ") + r.text,
        "diff-line " + r.kind,
      ),
    );
  }
  if (skipped)
    $("unifiedDiff").append(
      textNode(
        "div",
        "  … " + skipped + t(" righe invariate"),
        "diff-line same",
      ),
    );
}
function updateEditor() {
  const text = $("editor").value,
    lines = text.split("\n").length;
  $("lineNumbers").textContent = Array.from(
    { length: lines },
    (_, i) => i + 1,
  ).join("\n");
  $("fileInfo").textContent =
    (opened?.path.split(".").pop()?.toUpperCase() || t("TESTO")) +
    " · " +
    new TextEncoder().encode(text).length +
    " B";
  $("previewCode").disabled = !opened;
  if (!$("codePreview").hidden)
    $("codePreview").innerHTML = JennyView.highlight(text);
  updateCursor();
}
function updateCursor() {
  const text = $("editor").value.slice(0, $("editor").selectionStart),
    lines = text.split("\n");
  $("cursorPosition").textContent =
    t("Riga ") + lines.length + t(", colonna ") + (lines.at(-1).length + 1);
}
$("editor").onscroll = () => {
  $("lineNumbers").scrollTop = $("editor").scrollTop;
};
$("editor").onclick = updateCursor;
$("editor").onkeyup = updateCursor;
$("editor").onkeydown = (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    const el = $("editor");
    el.setRangeText("  ", el.selectionStart, el.selectionEnd, "end");
    el.dispatchEvent(new Event("input"));
  }
  if (e.key === "Enter") {
    e.preventDefault();
    const el = $("editor"),
      start = el.selectionStart,
      line = el.value.slice(0, start).split("\n").at(-1),
      indent = line.match(/^\s*/)[0];
    el.setRangeText("\n" + indent, el.selectionStart, el.selectionEnd, "end");
    el.dispatchEvent(new Event("input"));
  }
};
$("previewCode").onclick = () => {
  $("codePreview").hidden = !$("codePreview").hidden;
  $("previewCode").textContent = $("codePreview").hidden
    ? t("Anteprima")
    : t("Modifica");
  updateEditor();
};
window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    if (opened && dirty) $("saveFile").click();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
    e.preventDefault();
    showView("files");
    $("fileSearch").focus();
  }
});
$("unifiedView").onclick = () => {
  $("unifiedDiff").hidden = false;
  $("splitDiff").hidden = true;
  $("unifiedView").classList.add("active");
  $("fullView").classList.remove("active");
};
$("fullView").onclick = () => {
  $("unifiedDiff").hidden = true;
  $("splitDiff").hidden = false;
  $("fullView").classList.add("active");
  $("unifiedView").classList.remove("active");
};
$("searchForm").onsubmit = act(async (e) => {
  e.preventDefault();
  const q = $("fileSearch").value.trim();
  if (!q) return;
  const ticket = ++searchTicket,
    current = workspace;
  $("files").replaceChildren(
    textNode("p", t("Ricerca in corso…"), "empty-files"),
  );
  const result = await api(
    "/search?workspace=" +
      encodeURIComponent(current) +
      "&q=" +
      encodeURIComponent(q),
  );
  if (ticket !== searchTicket || current !== workspace) return;
  $("clearSearch").hidden = false;
  $("files").replaceChildren();
  $("fileCount").textContent = result.matches.length + t(" risultati");
  for (const hit of result.matches) {
    const b = textNode(
      "button",
      hit.path + (hit.line ? " : " + hit.line : ""),
      "search-hit",
    );
    b.append(textNode("small", hit.line === 0 ? t("Nome file") : hit.text));
    b.onclick = act(async () => {
      await openFile(hit.path);
      if (opened?.path === hit.path && hit.line) {
        const start =
          $("editor")
            .value.split("\n")
            .slice(0, hit.line - 1)
            .join("\n").length + (hit.line > 1 ? 1 : 0);
        $("editor").focus();
        $("editor").setSelectionRange(start, start);
        $("editor").scrollTop =
          (hit.line - 1) * parseFloat(getComputedStyle($("editor")).lineHeight);
        updateCursor();
      }
    });
    $("files").append(b);
  }
  if (!result.matches.length)
    $("files").append(
      textNode("p", t("Nessun risultato nei file esaminati."), "empty-files"),
    );
  if (result.truncated)
    notice(
      t("Ricerca limitata per dimensione o tempo. Usa un termine più preciso."),
    );
});
$("clearSearch").onclick = act(async () => {
  searchTicket++;
  $("fileSearch").value = "";
  $("clearSearch").hidden = true;
  await listFiles();
});
$("renameChat").onclick = () => {
  if (!session) return;
  nameMode = "rename";
  $("nameTitle").textContent = t("Rinomina conversazione");
  $("nameLabel").textContent = t("Titolo");
  $("newName").value = session.title;
  $("nameDialog").showModal();
};
$("exportChat").onclick = act(async () => {
  const data = await api("/sessions/" + session.id + "/export");
  const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "jenny-chat-" + data.conversation.id + ".json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
function showView(view) {
  document.body.dataset.view = view;
  $("showChat").setAttribute("aria-pressed", view === "chat");
  $("showFiles").setAttribute("aria-pressed", view === "files");
}
$("showChat").onclick = () => showView("chat");
$("showFiles").onclick = () => showView("files");
$("language").value = locale.language;
const savedTheme = localStorage.getItem("jenny-theme");
if (savedTheme) document.documentElement.dataset.theme = savedTheme;
$("theme").onclick = () => {
  const theme =
    document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("jenny-theme", theme);
};
function setWidth(width) {
  width = Math.max(25, Math.min(60, width));
  document.documentElement.style.setProperty("--files-width", width + "%");
  $("divider").setAttribute("aria-valuenow", Math.round(width));
}
$("divider").onpointerdown = (e) => {
  e.preventDefault();
  $("divider").setPointerCapture(e.pointerId);
};
$("divider").onpointermove = (e) => {
  if ($("divider").hasPointerCapture(e.pointerId))
    setWidth(((window.innerWidth - e.clientX) / window.innerWidth) * 100);
};
$("divider").onkeydown = (e) => {
  if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
    e.preventDefault();
    setWidth(
      Number($("divider").getAttribute("aria-valuenow")) +
        (e.key === "ArrowLeft" ? 2 : -2),
    );
  }
};
async function providerStatus() {
  try {
    const model = $("model").value,
      status = await api("/provider-status?model=" + encodeURIComponent(model));
    if (model !== $("model").value) return;
    if (status.provider !== "ollama") return;
    $("connection").textContent = "Ollama " + (status.version || t("connesso"));
    const lines = (status.running || []).map(
      (m) => m.name + " · VRAM " + (m.sizeVRAM / 1024 ** 3).toFixed(1) + " GiB",
    );
    $("ollamaRunning").textContent =
      lines.join("\n") || t("Nessun modello caricato al momento.");
    const capabilities = status.model?.capabilities || [];
    $("ollamaCapabilities").textContent = capabilities.length
      ? t("Capacità: ") + capabilities.join(", ")
      : t("Capacità del modello non disponibili.");
    if (capabilities.length && !capabilities.includes("tools")) {
      notice(
        t("Il modello non dichiara supporto tool: usa la chat senza Agente."),
      );
    }
  } catch (e) {
    notice(t(e.message));
  }
}
$("model").onchange = providerStatus;
$("checkOllama").onclick = providerStatus;

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext)
    return navigator.clipboard.writeText(text);
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  try {
    if (!document.execCommand("copy"))
      throw new Error(
        t(
          "Copia automatica non disponibile: seleziona il codice e copialo manualmente.",
        ),
      );
  } finally {
    field.remove();
  }
}

function syncDraft() {
  const key = "jenny-draft:" + workspace + ":" + (session?.id || "new");
  if (key === draftKey) return;
  if (draftKey) {
    if ($("prompt").value) sessionStorage.setItem(draftKey, $("prompt").value);
    else sessionStorage.removeItem(draftKey);
  }
  draftKey = key;
  $("prompt").value = sessionStorage.getItem(key) || "";
}
$("prompt").addEventListener("input", () => {
  if (draftKey) {
    if ($("prompt").value) sessionStorage.setItem(draftKey, $("prompt").value);
    else sessionStorage.removeItem(draftKey);
  }
});
$("language").onchange = () => {
  const connectionText = $("connection").textContent;
  const connectionKey = Object.keys(JennyI18n.catalog[locale.language]).find(
    (key) => t(key) === connectionText,
  );
  locale.set($("language").value);
  paintAttachments();
  $("diagnosticsResult").replaceChildren();
  $("testResults").replaceChildren();
  localStorage.setItem("jenny-language", locale.language);
  JennyI18n.apply(document, locale);
  $("connection").textContent = connectionKey
    ? t(connectionKey)
    : connectionText;
  if (lastConfig) paintConfig(lastConfig);
  renderKey = "";
  approvalKey = "";
  render();
  updateEditor();
  $("fileName").textContent = opened
    ? opened.path + (dirty ? " •" : "")
    : t("Nessun file aperto");
  $("previewCode").textContent = $("codePreview").hidden
    ? t("Anteprima")
    : t("Modifica");
  if (!$("notice").hidden) $("notice").hidden = true;
  listFiles().catch((e) => notice(t(e.message)));
  providerStatus();
};

setupEditorUI();
setupWorkbench();
