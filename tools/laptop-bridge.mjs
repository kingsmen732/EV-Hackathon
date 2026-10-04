#!/usr/bin/env node
/**
 * ChargeMesh laptop bridge — exposes a local model server on the laptop (Ollama, GenieX,
 * LM Studio, llama.cpp: anything OpenAI-compatible) to the ChargeMesh PWA on the phone.
 *
 *   node tools/laptop-bridge.mjs                       # Ollama on :11434
 *   node tools/laptop-bridge.mjs --upstream http://127.0.0.1:18181/v1   # GenieX on Snapdragon X
 *
 * It adds the CORS / private-network headers a browser needs, checks a pairing code, and
 * copies the link + code to the clipboard so Office Kit's shared clipboard carries it to the phone.
 * No dependencies. Node 18+.
 */
import http from "node:http";
import os from "node:os";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const UPSTREAM = arg("upstream", process.env.UPSTREAM || "http://127.0.0.1:11434/v1").replace(/\/+$/, "");
const PORT = +arg("port", process.env.PORT || 8787);
const CODE = arg("code", process.env.BRIDGE_CODE || randomBytes(4).toString("hex"));
const OPEN = process.argv.includes("--no-code");

const cors = (req) => ({
  "Access-Control-Allow-Origin": req.headers.origin || "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Private-Network": "true",
  "Access-Control-Max-Age": "600", Vary: "Origin",
});

http.createServer(async (req, res) => {
  const h = cors(req);
  if (req.method === "OPTIONS") { res.writeHead(204, h); return res.end(); }
  if (!req.url.startsWith("/v1/")) { res.writeHead(404, h); return res.end("ChargeMesh laptop bridge"); }
  if (!OPEN && req.headers.authorization !== `Bearer ${CODE}`) {
    res.writeHead(401, { ...h, "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Wrong pairing code" }));
  }
  try {
    const chunks = []; for await (const c of req) chunks.push(c);
    const t0 = Date.now();
    const up = await fetch(UPSTREAM + req.url.slice(3), {
      method: req.method, headers: { "Content-Type": "application/json" },
      body: req.method === "POST" ? Buffer.concat(chunks) : undefined,
    });
    const body = Buffer.from(await up.arrayBuffer());
    res.writeHead(up.status, { ...h, "Content-Type": up.headers.get("content-type") || "application/json" });
    res.end(body);
    console.log(`${new Date().toLocaleTimeString()}  ${req.method} ${req.url}  ${up.status}  ${Date.now() - t0} ms`);
  } catch (e) {
    res.writeHead(502, { ...h, "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `Model server not reachable at ${UPSTREAM}: ${e.message}` }));
  }
}).listen(PORT, "0.0.0.0", () => {
  const lan = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal)?.address;
  const text = `http://127.0.0.1:${PORT}/v1   code: ${OPEN ? "(none)" : CODE}`;
  const clip = process.platform === "win32" ? ["clip"] : process.platform === "darwin" ? ["pbcopy"] : ["xclip", "-selection", "clipboard"];
  const copied = spawnSync(clip[0], clip.slice(1), { input: text }).status === 0;
  console.log(`
ChargeMesh laptop bridge  ->  ${UPSTREAM}

  Link          http://127.0.0.1:${PORT}/v1
  Pairing code  ${OPEN ? "(disabled)" : CODE}
  ${copied ? "Copied to the clipboard — paste on the phone (Office Kit shared clipboard)." : "Copy the two values above to the phone."}

The phone app is served over https, so the browser only allows plain-http calls to 127.0.0.1.
Make 127.0.0.1:${PORT} on the phone point at this laptop with ONE of:

  USB        adb reverse tcp:${PORT} tcp:${PORT}
  Wireless   cloudflared tunnel --url http://127.0.0.1:${PORT}     (then use the https link it prints + /v1)
${lan ? `  LAN (only when the app itself is opened over http):  http://${lan}:${PORT}/v1\n` : ""}`);
});
