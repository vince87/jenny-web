"use strict";
const loginLocale = JennyI18n.create(
  localStorage.getItem("jenny-language") || "it",
);
const loginElement = (id) => document.getElementById(id);
JennyI18n.apply(document, loginLocale);
loginElement("loginLanguage").value = loginLocale.language;
loginElement("loginLanguage").onchange = () => {
  loginLocale.set(loginElement("loginLanguage").value);
  localStorage.setItem("jenny-language", loginLocale.language);
  JennyI18n.apply(document, loginLocale);
};
fetch("/api/auth/me")
  .then((r) => r.json())
  .then((data) => {
    loginElement("setupHint").hidden = !data.setupRequired;
  })
  .catch(() => {});
loginElement("loginForm").onsubmit = async (event) => {
  event.preventDefault();
  loginElement("loginSubmit").disabled = true;
  loginElement("loginError").textContent = "";
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept-Language": loginLocale.language,
      },
      body: JSON.stringify({
        username: loginElement("username").value,
        password: loginElement("password").value,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error);
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith("jenny-")) sessionStorage.removeItem(key);
    localStorage.setItem("jenny-account-change", String(Date.now()));
    window.location.replace("/");
  } catch (error) {
    loginElement("loginError").textContent = loginLocale.t(error.message);
  } finally {
    loginElement("password").value = "";
    loginElement("loginSubmit").disabled = false;
  }
};
