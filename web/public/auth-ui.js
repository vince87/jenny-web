"use strict";
function exitAccount() {
  clearPersonalStorage();
  localStorage.setItem("jenny-account-change", String(Date.now()));
  leaveAccount();
}
$("logoutButton").onclick = act(async () => {
  if (!canDiscard()) return;
  await api("/auth/logout", {});
  exitAccount();
});
$("accountButton").onclick = act(async () => {
  $("accountDialog").showModal();
  if (currentUser?.role === "admin") await refreshUsers();
});
$("accountClose").onclick = () => $("accountDialog").close();
$("passwordForm").onsubmit = act(async (event) => {
  event.preventDefault();
  if ($("newPassword").value !== $("repeatPassword").value)
    throw Error("Le password non coincidono.");
  try {
    await api("/auth/password", {
      currentPassword: $("currentPassword").value,
      newPassword: $("newPassword").value,
    });
    exitAccount();
  } finally {
    for (const id of ["currentPassword", "newPassword", "repeatPassword"])
      $(id).value = "";
  }
});
async function refreshUsers() {
  const { users } = await api("/auth/users");
  $("usersList").replaceChildren();
  for (const user of users) {
    const row = textNode(
      "div",
      user.username +
        " · " +
        user.role +
        " · " +
        t(user.disabled ? "Disattivato" : "Attivo"),
    );
    if (user.id !== currentUser.id) {
      const button = textNode(
        "button",
        t(user.disabled ? "Attiva" : "Disattiva"),
      );
      button.onclick = act(async () => {
        await api("/auth/users/disable", {
          id: user.id,
          disabled: !user.disabled,
        });
        await refreshUsers();
      });
      row.append(button);
    }
    $("usersList").append(row);
  }
}
$("usersRefresh").onclick = act(refreshUsers);
$("createUserForm").onsubmit = act(async (event) => {
  event.preventDefault();
  try {
    await api("/auth/users", {
      username: $("newUsername").value,
      password: $("userPassword").value,
    });
    $("newUsername").value = "";
    await refreshUsers();
  } finally {
    $("userPassword").value = "";
  }
});
