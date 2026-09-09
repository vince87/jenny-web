"use strict";
const dns = require("node:dns/promises");
const net = require("node:net");
const http = require("node:http");
const https = require("node:https");
function publicAddress(ip) {
  if (net.isIP(ip) === 6)
    return (
      /^[23][0-9a-f]{3}:/i.test(ip) && !ip.toLowerCase().startsWith("2001:db8:")
    );
  if (net.isIP(ip) !== 4) return false;
  const [a, b] = ip.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && [0, 168].includes(b)) ||
    (a === 198 && [18, 19, 51].includes(b)) ||
    (a === 203 && b === 0)
  );
}
async function request(
  address,
  {
    method = "GET",
    headers = {},
    body,
    signal,
    privateNetwork = false,
    limit = 1024 * 1024,
    complete,
  } = {},
) {
  const url = new URL(address);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw Error("HTTP(S) URL without embedded credentials required.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const ips = net.isIP(host)
    ? [{ address: host, family: net.isIP(host) }]
    : await dns.lookup(host, { all: true });
  if (
    !ips.length ||
    (!privateNetwork && ips.some((x) => !publicAddress(x.address)))
  )
    throw Error("Private or reserved network destination blocked.");
  const ip = ips[0];
  return new Promise((resolve, reject) => {
    const req = (url.protocol === "https:" ? https : http).request(
      url,
      {
        method,
        headers,
        signal: AbortSignal.any([
          signal || new AbortController().signal,
          AbortSignal.timeout(20000),
        ]),
        lookup: (_h, o, cb) =>
          o.all ? cb(null, [ip]) : cb(null, ip.address, ip.family),
      },
      (res) => {
        let size = 0;
        const chunks = [];
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > limit) res.destroy(Error("Response exceeds size limit."));
          else {
            chunks.push(chunk);
            if (
              complete &&
              complete(Buffer.concat(chunks).toString("utf8"), res.headers)
            ) {
              resolve({
                status: res.statusCode,
                headers: res.headers,
                text: Buffer.concat(chunks).toString("utf8"),
              });
              res.destroy();
            }
          }
        });
        res.on("error", reject);
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}
function textHTML(html) {
  return html
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
async function readPage(address, signal) {
  let url = new URL(address);
  for (let n = 0; n < 5; n++) {
    const r = await request(url.href, {
      signal,
      headers: { "User-Agent": "JennyWeb/0.6 (+user-approved fetch)" },
    });
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      url = new URL(r.headers.location, url);
      continue;
    }
    if (r.status !== 200) throw Error("Web HTTP " + r.status);
    const type = r.headers["content-type"] || "";
    if (!/text\/|application\/(json|xml)/i.test(type))
      throw Error("Only text pages are supported.");
    const links = [];
    for (const m of r.text.matchAll(
      /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    )) {
      try {
        const link = new URL(m[1].replace(/&amp;/g, "&"), url);
        if (["http:", "https:"].includes(link.protocol) && links.length < 40)
          links.push({ url: link.href, title: textHTML(m[2]).slice(0, 200) });
      } catch {}
    }
    const text = /html/i.test(type) ? textHTML(r.text) : r.text;
    return {
      url: url.href,
      text: text.slice(0, 12000),
      truncated: text.length > 12000,
      links,
      untrusted: true,
    };
  }
  throw Error("Too many redirects.");
}
module.exports = { request, readPage, publicAddress, textHTML };
