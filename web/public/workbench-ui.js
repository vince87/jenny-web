"use strict";
const attachedByChat = new Map();
let lastAttachmentKey = "",
  instructionRevision = null,
  instructionWorkspace = "",
  workbenchReady = false,
  instructionsInitial = "";
const attachmentKey = () => workspace + ":" + (session?.id || "new");
function currentAttachments() {
  return attachedByChat.get(attachmentKey()) || [];
}
function clearAttachments() {
  attachedByChat.delete(attachmentKey());
  lastAttachmentKey = "";
}
function paintAttachments() {
  $("attachmentList").replaceChildren();
  currentAttachments().forEach((a, i) => {
    const b = textNode("button", a.name + " ×");
    b.type = "button";
    b.setAttribute("aria-label", t("Rimuovi allegato") + ": " + a.name);
    b.onclick = () => {
      const list = currentAttachments().slice();
      list.splice(i, 1);
      attachedByChat.set(attachmentKey(), list);
      paintAttachments();
    };
    $("attachmentList").append(b);
  });
}
function paintWorkbenchState() {
  if (!workbenchReady) return;
  $("archiveChat").disabled =
    !session || ["running", "waiting", "approving"].includes(session.status);
  $("profile").disabled =
    lastConfig?.provider !== "ollama" ||
    ["running", "waiting", "approving"].includes(session?.status);
  const key = attachmentKey();
  if (lastAttachmentKey !== key) {
    lastAttachmentKey = key;
    paintAttachments();
    $("profile").value = session?.profile || "server";
  }
  const c = session?.context,
    u = session?.metrics?.usage;
  $("contextProgress").max = c?.maxInput || 1;
  $("contextProgress").value = c?.estimatedTokens || 0;
  $("contextDetails").textContent = c
    ? ` ~${c.estimatedTokens}/${c.maxInput} · ${t("Turni esclusi")}: ${c.droppedTurns}`
    : t("Disponibile dopo la prima richiesta Ollama.");
  if (u)
    $("contextDetails").textContent +=
      ` · ${t("Token input misurati")}: ${u.prompt_tokens}`;
  if (c?.compactedMessages)
    $("contextDetails").textContent +=
      ` · ${t("Messaggi riassunti")}: ${c.compactedMessages}`;
}
function paintBatch(p) {
  $("batchChoices").replaceChildren();
  $("approvalHint").textContent = p.files
    ? t("Si applicano solo i file selezionati. Possibili risultati parziali.")
    : t("Si applica solo a questo file.");
  for (const [i, f] of (p.files || []).entries()) {
    const row = document.createElement("div"),
      label = document.createElement("label"),
      check = document.createElement("input");
    check.type = "checkbox";
    check.id = "batch-" + i;
    label.append(check, document.createTextNode(f.path));
    const view = textNode("button", t("Confronta"));
    view.type = "button";
    view.onclick = () => {
      renderDiff(f);
      $("approvalPath").textContent = f.path;
      $("before").textContent = f.before ?? t("(Nuovo file)");
      $("after").textContent = f.after;
    };
    row.append(label, view);
    $("batchChoices").append(row);
  }
}
function downloadJSON(data, name) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function setupWorkbench() {
  workbenchReady = true;
  let searchTimer;
  $("chatSearch").oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(
      () => listSessions().catch((e) => notice(e.message)),
      200,
    );
  };
  $("showArchived").onchange = act(listSessions);
  $("archiveChat").onclick = act(async () => {
    if (!session) return;
    const id = session.id;
    const next = await api("/sessions/" + id + "/archive", {
      archived: !session.archived,
    });
    if (session?.id === id) {
      session = next;
      render();
    }
    await listSessions();
  });
  async function addAttachments(items, key) {
    if (key !== attachmentKey()) return;
    const list = [...currentAttachments(), ...items];
    if (list.length > 5) throw Error(t("Massimo 5 allegati testuali."));
    if (
      list.reduce((n, a) => n + new TextEncoder().encode(a.content).length, 0) >
      12000
    )
      throw Error(t("Allegati oltre 12.000 byte. Seleziona meno testo."));
    attachedByChat.set(key, list);
    paintAttachments();
  }
  $("attachments").onchange = act(async () => {
    const key = attachmentKey(),
      files = Array.from($("attachments").files);
    $("attachments").value = "";
    if (files.length > 5 || files.reduce((n, f) => n + f.size, 0) > 12000)
      throw Error(t("Allegati oltre 12.000 byte. Seleziona meno testo."));
    const items = [];
    for (const f of files) {
      const content = new TextDecoder("utf-8", { fatal: true }).decode(
        await f.arrayBuffer(),
      );
      if (content.includes("\0")) throw Error(t("Allegato non valido."));
      items.push({ name: f.name, content });
    }
    await addAttachments(items, key);
  });
  $("attachCurrent").onclick = act(async () => {
    if (!opened || opened.workspace !== workspace) return;
    await addAttachments(
      [{ name: opened.path, content: $("editor").value }],
      attachmentKey(),
    );
  });
  $("workbenchButton").onclick = act(async () => {
    if (!workspace) return;
    instructionWorkspace = workspace;
    const current = workspace;
    const r = await api(
      "/instructions?" + new URLSearchParams({ workspace: current }),
    );
    if (workspace !== current) return;
    instructionRevision = r.revision;
    instructionsInitial = r.content;
    $("projectInstructions").value = r.content;
    $("workbench").showModal();
    $("closeWorkbench").focus();
  });
  const canClose = () =>
    $("projectInstructions").value === instructionsInitial ||
    confirm(t("Scartare le istruzioni non salvate?"));
  $("closeWorkbench").onclick = () => {
    if (canClose()) $("workbench").close();
  };
  $("workbench").addEventListener("cancel", (e) => {
    if (!canClose()) e.preventDefault();
  });
  for (const button of document.querySelectorAll("[data-panel]"))
    button.onclick = () => {
      for (const other of document.querySelectorAll("[data-panel]")) {
        $(other.dataset.panel).hidden = other !== button;
        other.setAttribute("aria-pressed", String(other === button));
      }
    };
  $("saveInstructions").onclick = act(async () => {
    const r = await api("/instructions", {
      workspace: instructionWorkspace,
      content: $("projectInstructions").value,
      revision: instructionRevision,
    });
    instructionRevision = r.revision;
    instructionsInitial = r.content;
    notice(t("Istruzioni salvate."));
    if (
      opened?.workspace === instructionWorkspace &&
      opened.path === "JENNY.md" &&
      !dirty
    )
      await openFile("JENNY.md");
    await listFiles();
  });
  $("runDiagnostics").onclick = act(async () => {
    $("runDiagnostics").disabled = true;
    $("diagnosticsResult").textContent = t("Verifica in corso…");
    try {
      const r = await api(
        "/diagnostics?" + new URLSearchParams({ model: $("model").value }),
      );
      $("diagnosticsResult").replaceChildren();
      for (const c of r.checks)
        $("diagnosticsResult").append(
          textNode(
            "p",
            (c.ok ? "✓ " : "! ") +
              ({
                data: t("Dati"),
                workspaces: "Workspace",
                connection: t("Connessione"),
                model: t("Modello"),
                tools: t("Strumenti"),
              }[c.name] || c.name) +
              " — " +
              t(c.hint),
          ),
        );
    } finally {
      $("runDiagnostics").disabled = false;
    }
  });
  $("refreshGit").onclick = act(async () => {
    $("gitResult").textContent = t("Verifica in corso…");
    try {
      const r = await api(
        "/git?" +
          new URLSearchParams({
            workspace: instructionWorkspace,
            action: $("gitAction").value,
          }),
      );
      $("gitResult").textContent = r.output || t("Nessuna modifica.");
    } catch (e) {
      $("gitResult").textContent = t(
        "Git non disponibile: verifica repository e installazione Git.",
      );
      throw e;
    }
  });
  async function refreshTests() {
    const { jobs } = await api("/runner");
    $("testResults").replaceChildren();
    for (const j of jobs.filter((j) => j.workspace === instructionWorkspace)) {
      const entry = document.createElement("details");
      entry.append(
        textNode(
          "summary",
          j.recipe +
            " · " +
            ({
              queued: t("In coda"),
              running: t("In esecuzione"),
              passed: t("Superato"),
              failed: t("Fallito"),
              interrupted: t("Interrotto"),
              cancelled: t("Annullato"),
            }[j.status] || j.status),
        ),
        textNode("pre", j.output),
      );
      if (j.status === "queued") {
        const cancel = textNode("button", t("Annulla test"));
        cancel.onclick = act(async () => {
          await api("/runner/cancel", { id: j.id });
          await refreshTests();
        });
        entry.append(cancel);
      }
      $("testResults").append(entry);
    }
  }
  $("queueTest").onclick = act(async () => {
    if (
      !confirm(
        t(
          "Eseguire il codice del progetto in un container temporaneo senza rete?",
        ),
      )
    )
      return;
    await api("/runner", {
      workspace: instructionWorkspace,
      recipe: $("testRecipe").value,
      confirmed: true,
    });
    await refreshTests();
  });
  $("refreshTests").onclick = act(refreshTests);
  $("exportAllChats").onclick = act(async () =>
    downloadJSON(await api("/export-chats"), "jenny-chats.json"),
  );
  const firstPanel = document.querySelector("[data-panel]");
  firstPanel?.click();
  paintWorkbenchState();
}
