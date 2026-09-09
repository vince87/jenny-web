#!/usr/bin/env node
"use strict";
const path = require("node:path"),
  readline = require("node:readline");
const { Writable } = require("node:stream");
const { Accounts } = require("../auth/accounts.cjs");
const { acquire } = require("../backup.cjs");
async function main() {
  const [command, name, confirmed] = process.argv.slice(2);
  if (
    !["init", "reset-password"].includes(command) ||
    !name ||
    (command === "init" && confirmed !== "--adopt-existing")
  )
    throw Error(
      "Usage: account.cjs init USER --adopt-existing | reset-password USER. Stop Jenny and back up first.",
    );
  if (!process.stdin.isTTY)
    throw Error(
      "Use an interactive terminal; passwords are not accepted as command arguments or environment variables.",
    );
  const data = path.resolve(
    process.env.DATA_DIR || path.join(__dirname, "../../web-data"),
  );
  const unlock = await acquire(data);
  let accounts;
  const quiet = new Writable({
    write(chunk, encoding, next) {
      next();
    },
  });
  const rl = readline.createInterface({
    input: process.stdin,
    output: quiet,
    terminal: true,
  });
  const ask = (question) => {
    process.stdout.write(question);
    return new Promise((resolve, reject) => {
      const interrupted = () => reject(Error("Account setup cancelled."));
      rl.once("close", interrupted);
      rl.question("", (answer) => {
        rl.removeListener("close", interrupted);
        process.stdout.write("\n");
        resolve(answer);
      });
    });
  };
  rl.on("SIGINT", () => rl.close());
  try {
    accounts = new Accounts(data);
    if (command === "init" && accounts.allUsers().length)
      throw Error("Administrator already initialized.");
    const password = await ask("Password (minimum 8 characters): ");
    if (password !== (await ask("Repeat password: ")))
      throw Error("Passwords do not match.");
    if (command === "init") await accounts.bootstrap(name, password);
    else await accounts.resetPasswordLocal(name, password);
    console.log(
      command === "init"
        ? "Administrator created. Existing data is assigned to this account; no files moved."
        : "Password updated.",
    );
  } finally {
    rl.close();
    accounts?.close();
    await unlock();
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
