"use strict";
const PROFILES = Object.freeze({
  light: {context:4096,predict:1024,keepAlive:"5m"},
  balanced: {context:8192,predict:2048,keepAlive:"10m"},
  extended: {context:16384,predict:4096,keepAlive:"10m"},
});
function profileSettings(base, name = "server") {
  if (name !== "server" && !Object.hasOwn(PROFILES, name)) throw new Error("Profilo non valido.");
  return {...base, ...(PROFILES[name] || {})};
}
module.exports = {PROFILES, profileSettings};
