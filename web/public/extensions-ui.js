"use strict";
let githubConnection = null,
  mcpDiscovered = [];
let pluginState = null;
const githubExamples = {
  repo: {},
  files: { path: "README.md", ref: "main" },
  issues: {},
  issue: { number: 1 },
  prs: {},
  pr: { number: 1 },
  commits: {},
  put_file: {
    path: "example.txt",
    branch: "your-branch",
    content: "New file content",
    message: "Update example",
    sha: "",
  },
  create_branch: { branch: "your-branch", sha: "COPY_COMMIT_SHA" },
  create_issue: { title: "Issue title", body: "Issue description" },
  comment: { number: 1, body: "Comment" },
  create_pr: {
    title: "Pull request title",
    body: "Description",
    head: "your-branch",
    base: "main",
  },
};
const githubWrites = [
  "put_file",
  "create_branch",
  "create_issue",
  "comment",
  "create_pr",
];
async function refreshExtensions() {
  const data = await api("/extensions");
  pluginState = data;
  $("pluginToggles").replaceChildren();
  for (const entry of data.catalog) {
    const items = data.installed.filter((i) => i.kind === entry.id);
    const button = textNode(
      "button",
      entry.name + " · " + (entry.state === "active" ? "ON" : "OFF"),
    );
    button.type = "button";
    button.setAttribute("aria-pressed", String(entry.state === "active"));
    button.disabled = entry.canActivate === false;
    button.onclick = act(async () => {
      if (!items.length && ["github", "mcp"].includes(entry.id)) {
        $("extensionsDialog").showModal();
        return;
      }
      if (!items.length)
        await api("/extensions/install", { kind: entry.id, confirmed: true });
      else
        for (const item of items)
          await api("/extensions/manage", {
            id: item.id,
            action: entry.state === "active" ? "disable" : "enable",
          });
      await refreshExtensions();
    });
    $("pluginToggles").append(button);
  }
  paintMentionMenu();
  githubConnection =
    data.installed.find((i) => i.kind === "github" && i.enabled) || null;
  $("githubActionForm").hidden = !githubConnection;
  $("githubInstallForm").hidden = data.installed.some(
    (i) => i.kind === "github",
  );
  $("pluginSummary").textContent = data.catalog
    .map(
      (item) =>
        item.name +
        ": " +
        t(
          item.state === "active"
            ? "Attivo"
            : item.state === "disabled"
              ? "Disattivato"
              : "Non installato",
        ),
    )
    .join(" · ");
  $("searchConfig").textContent =
    t("Ricerca configurata in .env:") +
    " " +
    data.search.provider +
    (data.search.endpoint ? " · " + data.search.endpoint : "");
  $("webKeyForm").hidden =
    data.search.provider === "searxng" ||
    data.search.provider === "duckduckgo" ||
    data.search.hasBraveKey;
  $("extensionsCatalog").replaceChildren();
  $("extensionsInstalled").replaceChildren();
  for (const item of data.catalog.filter(
    (i) => !["mcp", "github"].includes(i.id),
  )) {
    const row = textNode(
      "div",
      item.name +
        " · " +
        t(
          item.state === "active"
            ? "Attivo"
            : item.state === "disabled"
              ? "Disattivato"
              : "Non installato",
        ),
    );
    const button = textNode(
      "button",
      t(item.canActivate === false ? "Solo amministratore." : "Installa"),
    );
    button.disabled =
      item.canActivate === false ||
      data.installed.some((i) => i.id === item.id);
    button.onclick = act(async () => {
      if (
        !confirm(
          t("Installare il plugin con i permessi indicati?") +
            "\n" +
            item.name +
            "\n" +
            t(item.description),
        )
      )
        return;
      await api("/extensions/install", { kind: item.id, confirmed: true });
      await refreshExtensions();
    });
    row.append(textNode("p", t(item.description)), button);
    $("extensionsCatalog").append(row);
  }
  for (const item of data.installed) {
    const row = textNode(
      "div",
      item.name + " · " + (item.enabled ? t("Attivo") : t("Disattivato")),
    );
    if (item.repository)
      row.append(
        textNode(
          "p",
          item.repository +
            " · " +
            t(item.writeEnabled ? "Lettura e scrittura" : "Sola lettura"),
        ),
      );
    row.append(
      textNode(
        "p",
        item.lastCheck
          ? t(item.lastCheck.ok ? "Verifica riuscita" : "Verifica fallita") +
              " · " +
              item.lastCheck.at
          : t("Connessione non verificata"),
      ),
    );
    if (item.enabled && !["terminal", "sandbox"].includes(item.kind)) {
      const check = textNode("button", t("Verifica connessione"));
      check.onclick = act(async () => {
        if (
          item.kind !== "web" &&
          !confirm(
            t("Contattare il servizio per verificarlo?") +
              "\n" +
              (item.url ||
                item.repository ||
                data.search.endpoint ||
                data.search.provider),
          )
        )
          return;
        check.disabled = true;
        try {
          const result = await api("/extensions/check", {
            id: item.id,
            confirmed: true,
          });
          $("pluginCheckOutput").textContent = JSON.stringify(result, null, 2);
          if (item.kind === "mcp" && result.ok)
            showMcpTools(item, result.tools);
          await refreshExtensions();
        } finally {
          check.disabled = false;
        }
      });
      row.append(check);
    }
    for (const action of ["enable", "disable", "remove"]) {
      const button = textNode(
        "button",
        t(
          { enable: "Attiva", disable: "Disattiva", remove: "Rimuovi" }[action],
        ),
      );
      button.onclick = act(async () => {
        if (
          action === "remove" &&
          !confirm(t("Rimuovere il plugin e le credenziali salvate?"))
        )
          return;
        await api("/extensions/manage", {
          id: item.id,
          action,
          confirmed: true,
        });
        await refreshExtensions();
      });
      row.append(button);
    }
    if (item.kind === "mcp") {
      row.append(textNode("p", item.url));
      const discover = textNode("button", t("Elenca strumenti"));
      discover.onclick = act(async () => {
        if (!confirm(t("Contattare questo server MCP?") + "\n" + item.url))
          return;
        const r = await api("/extensions/execute", {
          name: "mcp_tools",
          arguments: { plugin: item.id },
          workspace,
          confirmed: true,
        });
        $("mcpOutput").textContent = r.result;
        showMcpTools(item, JSON.parse(r.result));
      });
      row.append(discover);
    }
    $("extensionsInstalled").append(row);
  }
}
$("extensionsButton").onclick = act(async () => {
  $("extensionsDialog").showModal();
  await refreshExtensions();
});
$("extensionsClose").onclick = () => $("extensionsDialog").close();
$("extensionsRefresh").onclick = act(refreshExtensions);
$("mcpInstallForm").onsubmit = act(async (event) => {
  event.preventDefault();
  const url = $("mcpURL").value;
  if (
    !confirm(
      t("Installare il plugin con i permessi indicati?") +
        "\n" +
        url +
        "\n" +
        t(
          "Il server MCP riceve gli argomenti approvati e può avere accesso a servizi esterni.",
        ),
    )
  )
    return;
  await api("/extensions/install", {
    kind: "mcp",
    name: $("mcpName").value,
    url,
    token: $("mcpToken").value,
    privateNetwork: $("mcpPrivate").checked,
    confirmed: true,
  });
  $("mcpToken").value = "";
  await refreshExtensions();
});
async function browseWeb(value) {
  const name = /^https?:\/\//i.test(value) ? "web_read" : "web_search";
  $("webOutput").textContent = t("Caricamento…");
  $("webLinks").replaceChildren();
  try {
    const result = await api("/extensions/execute", {
      name,
      arguments: name === "web_read" ? { url: value } : { query: value },
      workspace,
      confirmed: true,
    });
    $("webOutput").textContent = result.text;
    for (const link of result.links || []) {
      const button = textNode("button", link.title || link.url);
      button.title = link.url;
      button.onclick = act(() => browseWeb(link.url));
      $("webLinks").append(button);
    }
  } catch (e) {
    $("webOutput").textContent = e.message;
    throw e;
  }
}
$("webForm").onsubmit = act(async (event) => {
  event.preventDefault();
  await browseWeb($("webInput").value);
});
$("webKeyForm").onsubmit = act(async (event) => {
  event.preventDefault();
  await api("/extensions/web", { token: $("webKey").value, confirmed: true });
  $("webKey").value = "";
  notice(t("Salvato."));
  await refreshExtensions();
});
async function refreshTerminal() {
  const current = workspace;
  const { jobs } = await api("/runner");
  if (workspace !== current) return;
  $("terminalOutput").replaceChildren();
  for (const job of jobs.filter(
    (j) =>
      j.workspace === current && ["terminal", "sandbox"].includes(j.recipe),
  )) {
    const row = document.createElement("details");
    row.open = true;
    row.append(
      textNode("summary", job.status + " · " + job.createdAt),
      textNode("pre", job.command + "\n" + job.output),
    );
    if (job.status === "queued") {
      const cancel = textNode("button", t("Annulla"));
      cancel.onclick = act(async () => {
        await api("/runner/cancel", { id: job.id });
        await refreshTerminal();
      });
      row.append(cancel);
    }
    $("terminalOutput").append(row);
  }
}
$("terminalForm").onsubmit = act(async (event) => {
  event.preventDefault();
  const command = $("terminalCommand").value;
  if (
    !confirm(
      t(
        $("useLab").checked
          ? "Eseguire nel laboratorio persistente? La rete dipende dal worker."
          : "Eseguire il codice del progetto in un container temporaneo senza rete?",
      ) +
        "\n" +
        command,
    )
  )
    return;
  await api("/extensions/execute", {
    name: $("useLab").checked ? "sandbox_run" : "terminal_run",
    arguments: { command },
    workspace,
    confirmed: true,
  });
  await refreshTerminal();
});
$("terminalRefresh").onclick = act(refreshTerminal);

function showMcpTools(item, tools) {
  mcpDiscovered = tools.map((tool) => ({
    ...tool,
    plugin: item.id,
    pluginName: item.name,
  }));
  $("mcpToolSelect").replaceChildren();
  for (const [index, tool] of mcpDiscovered.entries()) {
    const option = textNode("option", item.name + " / " + tool.name);
    option.value = String(index);
    $("mcpToolSelect").append(option);
  }
  $("mcpToolSelect").onchange();
}
$("mcpToolSelect").onchange = () => {
  const tool = mcpDiscovered[Number($("mcpToolSelect").value)];
  $("mcpToolSchema").textContent = tool
    ? JSON.stringify(tool.inputSchema, null, 2)
    : "";
};
$("mcpCallForm").onsubmit = act(async (event) => {
  event.preventDefault();
  const tool = mcpDiscovered[Number($("mcpToolSelect").value)];
  if (!tool) throw Error("Verifica prima un server MCP.");
  const args = JSON.parse($("mcpArguments").value);
  if (
    !confirm(
      t("Rivedi ed esegui") +
        "\n" +
        tool.pluginName +
        " / " +
        tool.name +
        "\n" +
        JSON.stringify(args, null, 2),
    )
  )
    return;
  $("mcpExecute").disabled = true;
  try {
    $("mcpOutput").textContent = (
      await api("/extensions/execute", {
        name: "mcp_call",
        arguments: { plugin: tool.plugin, tool: tool.name, arguments: args },
        workspace,
        confirmed: true,
      })
    ).result;
  } finally {
    $("mcpExecute").disabled = false;
  }
});
$("githubInstallForm").onsubmit = act(async (event) => {
  event.preventDefault();
  const repository = $("githubRepository").value.trim(),
    writeEnabled = $("githubWrite").checked;
  if (
    !confirm(
      t("Collegare questo repository GitHub?") +
        "\n" +
        repository +
        "\n" +
        t(writeEnabled ? "Lettura e scrittura" : "Sola lettura"),
    )
  )
    return;
  try {
    await api("/extensions/install", {
      kind: "github",
      repository,
      token: $("githubToken").value,
      writeEnabled,
      confirmed: true,
    });
    await refreshExtensions();
  } finally {
    $("githubToken").value = "";
  }
});
$("githubAction").onchange = () => {
  $("githubParameters").value = JSON.stringify(
    githubExamples[$("githubAction").value],
    null,
    2,
  );
};
let githubBusy = false;
$("githubActionForm").onsubmit = act(async (event) => {
  event.preventDefault();
  if (githubBusy) return;
  if (!githubConnection) throw Error("Collega e attiva GitHub.");
  const action = $("githubAction").value,
    parameters = JSON.parse($("githubParameters").value);
  const writing = githubWrites.includes(action);
  if (writing && !githubConnection.writeEnabled)
    throw Error("GitHub: scrittura non abilitata.");
  const args = { repository: githubConnection.repository, action, parameters };
  if (
    !confirm(
      t(
        writing
          ? "Confermi la modifica su GitHub?"
          : "Contattare questo repository GitHub?",
      ) +
        "\n" +
        JSON.stringify(args, null, 2),
    )
  )
    return;
  githubBusy = true;
  $("githubExecute").disabled = true;
  try {
    $("githubOutput").textContent = (
      await api("/extensions/execute", {
        name: writing ? "github_write" : "github_read",
        arguments: args,
        workspace,
        confirmed: true,
      })
    ).result;
  } finally {
    githubBusy = false;
    $("githubExecute").disabled = false;
  }
});
async function ensureWebActive() {
  await refreshExtensions();
  const item = pluginState.installed.find((i) => i.kind === "web");
  if (item?.enabled) return;
  if (!confirm(t("Attivare il plugin Web per questa ricerca?")))
    throw Error("Ricerca annullata.");
  if (item)
    await api("/extensions/manage", {
      id: item.id,
      action: "enable",
      confirmed: true,
    });
  else await api("/extensions/install", { kind: "web", confirmed: true });
  await refreshExtensions();
}
function paintMentionMenu() {
  $("mentionMenu").replaceChildren();
  for (const item of pluginState?.catalog || []) {
    const button = textNode(
      "button",
      "@" +
        item.id +
        " · " +
        t(
          item.state === "active"
            ? "Attivo"
            : item.state === "disabled"
              ? "Disattivato"
              : "Non installato",
        ),
    );
    button.type = "button";
    button.disabled = item.canActivate === false;
    button.onclick = () => {
      const input = $("prompt"),
        prefix = input.value.slice(0, input.selectionStart),
        suffix = input.value.slice(input.selectionEnd);
      input.value = prefix.replace(/@\w*$/, "") + "@" + item.id + " " + suffix;
      $("mentionMenu").hidden = true;
      input.focus();
      if (item.state !== "active")
        notice(t("Configura o attiva il plugin nel pannello Plugin."));
    };
    $("mentionMenu").append(button);
  }
}
$("mentionButton").onclick = act(async () => {
  await refreshExtensions();
  $("mentionMenu").hidden = !$("mentionMenu").hidden;
});
$("prompt").addEventListener("input", () => {
  const before = $("prompt").value.slice(0, $("prompt").selectionStart);
  $("mentionMenu").hidden = !/(?:^|\s)@\w*$/.test(before);
});
let memoryRevision = null,
  memoryWorkspace = null;
$("memoryButton").onclick = act(async () => {
  memoryWorkspace = workspace;
  const value = await api(
    "/memory?workspace=" + encodeURIComponent(memoryWorkspace),
  );
  memoryRevision = value.revision;
  $("memoryContent").value = value.content;
  $("memoryEnabled").checked = value.enabled;
  $("memoryDialog").showModal();
});
$("memorySave").onclick = act(async () => {
  const value = await api("/memory", {
    workspace: memoryWorkspace,
    content: $("memoryContent").value,
    enabled: $("memoryEnabled").checked,
    revision: memoryRevision,
  });
  memoryRevision = value.revision;
  $("memoryDialog").close();
});
$("memoryClear").onclick = act(async () => {
  const value = await api("/memory", {
    workspace: memoryWorkspace,
    content: "",
    enabled: false,
    revision: memoryRevision,
  });
  memoryRevision = value.revision;
  $("memoryContent").value = "";
  $("memoryEnabled").checked = false;
});
$("memoryClose").onclick = () => $("memoryDialog").close();
