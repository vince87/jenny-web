"use strict";
function setupEditorUI() {
let historyTarget = null,
  historyEntry = null;
$("fileHistory").onclick = act(async () => {
  if (!opened) return;
  historyTarget = opened;
  const requestedTarget = opened;
  historyEntry = null;
  $("historyLoad").disabled = true;
  $("historyPreview").textContent = "";
  const result = await api(
    "/file-history?" +
      new URLSearchParams({ workspace: opened.workspace, path: opened.path }),
  );
  if (opened !== requestedTarget || historyTarget !== requestedTarget) return;
  $("historyVersions").replaceChildren();
  for (const version of result.versions) {
    const option = document.createElement("option");
    option.value = version.id;
    option.textContent = version.date;
    $("historyVersions").append(option);
  }
  $("historyDialog").showModal();
  if (result.versions.length) $("historyVersions").onchange();
  else $("historyPreview").textContent = t("Nessuna versione precedente.");
});
$("historyVersions").onchange = act(async () => {
  historyEntry = null;
  $("historyLoad").disabled = true;
  const id = $("historyVersions").value,
    target = historyTarget;
  const entry = await api(
    "/file-history?" +
      new URLSearchParams({
        workspace: target.workspace,
        path: target.path,
        id,
      }),
  );
  if (historyTarget !== target || $("historyVersions").value !== id) return;
  historyEntry = entry;
  $("historyPreview").textContent =
    t("Attuale") +
    "\n" +
    target.content +
    "\n\n" +
    t("Versione precedente") +
    "\n" +
    entry.content;
  $("historyLoad").disabled = false;
});
$("historyLoad").onclick = () => {
  if (!historyEntry || opened !== historyTarget) return;
  if (dirty && !confirm(t("Sostituire le modifiche non salvate?"))) return;
  $("editor").value = historyEntry.content;
  $("editor").oninput();
  $("historyDialog").close();
};
$("historyClose").onclick = () => $("historyDialog").close();

}
