"use client";
/**
 * Edge AI engine: runs open-source language models locally, never through a cloud API.
 *
 * Engines, tried in this order in "auto" mode:
 *   1. phone-npu  An OpenAI-compatible model server running ON THE PHONE and executing on the
 *                 Snapdragon NPU (Qualcomm GenieAPIService / GenieX, or llama.cpp / MLC builds).
 *                 Reached at http://127.0.0.1:<port>/v1 — loopback, so nothing leaves the device.
 *   2. browser    A model running inside this PWA with WebLLM (WebGPU on the Adreno GPU).
 *                 Zero setup; weights are downloaded once and cached for offline use.
 *   3. laptop     A bigger model on the paired laptop (Ollama / GenieX / LM Studio), for
 *                 "deeper compute". The link is shared from the laptop with vivo/iQOO Office Kit
 *                 (shared clipboard) and pasted on the AI page.
 *   4. rules      Deterministic fallback so every feature still works with no model at all.
 */
import { store } from "../api";

export type EngineKind = "phone-npu" | "browser" | "laptop" | "rules";
export type AiMode = "auto" | EngineKind | "off";

export interface AiConfig {
  mode: AiMode;
  phoneUrl: string; phoneModel: string;
  laptopUrl: string; laptopModel: string; laptopKey: string;
  browserModel: string;
}

export const PHONE_PRESETS = [
  { label: "Qualcomm GenieAPIService (NPU)", url: "http://127.0.0.1:8910/v1" },
  { label: "Qualcomm GenieX server (NPU)", url: "http://127.0.0.1:18181/v1" },
  { label: "llama.cpp server", url: "http://127.0.0.1:8080/v1" },
  { label: "Ollama", url: "http://127.0.0.1:11434/v1" },
];

export const BROWSER_MODELS = [
  { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", label: "Llama 3.2 1B", size: "~0.9 GB" },
  { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", label: "Qwen 2.5 1.5B", size: "~1.6 GB" },
  { id: "gemma-2-2b-it-q4f16_1-MLC-1k", label: "Gemma 2 2B", size: "~1.6 GB" },
  { id: "SmolLM2-360M-Instruct-q4f16_1-MLC", label: "SmolLM2 360M (tiny)", size: "~0.4 GB" },
];

export const DEFAULT_CONFIG: AiConfig = {
  mode: "auto",
  phoneUrl: PHONE_PRESETS[0].url, phoneModel: "",
  laptopUrl: "", laptopModel: "", laptopKey: "",
  browserModel: BROWSER_MODELS[0].id,
};

export const ENGINE_LABEL: Record<EngineKind, string> = {
  "phone-npu": "Phone · Snapdragon NPU",
  browser: "Phone · in-app model (WebGPU)",
  laptop: "Laptop · Office Kit link",
  rules: "Built-in rules (no model)",
};

const KEY = "cm.ai";
export function loadConfig(): AiConfig {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(store.get(KEY) || "{}") }; } catch { return DEFAULT_CONFIG; }
}
export function saveConfig(c: AiConfig) { store.set(KEY, JSON.stringify(c)); }

export interface ChatMsg { role: "system" | "user" | "assistant"; content: string }
export interface AiResult { text: string; engine: EngineKind; model: string; ms: number; tokens?: number }

const norm = (u: string) => u.trim().replace(/\/+$/, "");

async function timed<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fn(ctl.signal); } finally { clearTimeout(t); }
}

// ---------------------------------------------------------------- OpenAI-compatible servers
export interface Probe { ok: boolean; models: string[]; ms: number; error?: string }
const probeCache = new Map<string, { at: number; p: Probe }>();

export async function probe(url: string, key = "", fresh = false): Promise<Probe> {
  const u = norm(url);
  if (!u) return { ok: false, models: [], ms: 0, error: "No address set" };
  const hit = probeCache.get(u);
  if (!fresh && hit && Date.now() - hit.at < 20000) return hit.p;
  const t0 = performance.now();
  let p: Probe;
  try {
    const r = await timed(2500, (signal) => fetch(`${u}/models`, { signal, headers: key ? { Authorization: `Bearer ${key}` } : {} }));
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const models = (j.data ?? j.models ?? []).map((m: { id?: string; name?: string }) => m.id ?? m.name).filter(Boolean);
    p = { ok: true, models, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    p = { ok: false, models: [], ms: Math.round(performance.now() - t0),
      error: /abort/i.test(msg) ? "No answer (is the model server running?)" : /fetch/i.test(msg) ? "Unreachable or blocked (check the server's CORS setting)" : msg };
  }
  probeCache.set(u, { at: Date.now(), p });
  return p;
}

async function chatOpenAI(url: string, model: string, key: string, messages: ChatMsg[], maxTokens: number, json: boolean) {
  const body: Record<string, unknown> = { model, messages, temperature: 0.1, max_tokens: maxTokens, stream: false };
  if (json) body.response_format = { type: "json_object" };
  const send = (b: Record<string, unknown>) => timed(45000, (signal) => fetch(`${norm(url)}/chat/completions`, {
    method: "POST", signal, headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(b),
  }));
  let r = await send(body);
  if (!r.ok && json) { delete body.response_format; r = await send(body); } // some runtimes reject response_format
  if (!r.ok) throw new Error(`Model server answered HTTP ${r.status}`);
  const j = await r.json();
  return { text: String(j.choices?.[0]?.message?.content ?? ""), tokens: j.usage?.completion_tokens as number | undefined };
}

// ---------------------------------------------------------------- in-browser model (WebLLM)
type MLCEngine = { chat: { completions: { create: (a: unknown) => Promise<any> } }; unload: () => Promise<void> };
let webllm: { engine: MLCEngine; model: string } | null = null;
let webllmLoading: Promise<MLCEngine> | null = null;

export const hasWebGPU = () => typeof navigator !== "undefined" && "gpu" in navigator;
export const browserModelLoaded = (id?: string) => !!webllm && (!id || webllm.model === id);

export async function browserModelCached(id: string): Promise<boolean> {
  try { const m = await import("@mlc-ai/web-llm"); return await m.hasModelInCache(id); } catch { return false; }
}

export async function loadBrowserModel(id: string, onProgress?: (pct: number, text: string) => void): Promise<void> {
  if (webllm?.model === id) return;
  if (!hasWebGPU()) throw new Error("This browser has no WebGPU, so the in-app model can't run here.");
  if (!webllmLoading) {
    webllmLoading = (async () => {
      const m = await import("@mlc-ai/web-llm");
      if (webllm) { try { await webllm.engine.unload(); } catch { /* ignore */ } webllm = null; }
      const engine = (await m.CreateMLCEngine(id, {
        initProgressCallback: (r: { progress: number; text: string }) => onProgress?.(Math.round(r.progress * 100), r.text),
      })) as unknown as MLCEngine;
      webllm = { engine, model: id };
      return engine;
    })().finally(() => { webllmLoading = null; });
  }
  await webllmLoading;
}

async function chatBrowser(messages: ChatMsg[], maxTokens: number, json: boolean) {
  if (!webllm) throw new Error("In-app model not loaded");
  const r = await webllm.engine.chat.completions.create({
    messages, temperature: 0.1, max_tokens: maxTokens, ...(json ? { response_format: { type: "json_object" } } : {}),
  });
  return { text: String(r.choices?.[0]?.message?.content ?? ""), tokens: r.usage?.completion_tokens as number | undefined };
}

// ---------------------------------------------------------------- routing
export interface EngineState { kind: EngineKind; ready: boolean; model: string; detail: string }

/** What is available right now, in priority order. */
export async function availability(cfg: AiConfig, fresh = false): Promise<EngineState[]> {
  const [phone, laptop] = await Promise.all([
    probe(cfg.phoneUrl, "", fresh),
    cfg.laptopUrl ? probe(cfg.laptopUrl, cfg.laptopKey, fresh) : Promise.resolve<Probe>({ ok: false, models: [], ms: 0, error: "Not paired" }),
  ]);
  return [
    { kind: "phone-npu", ready: phone.ok, model: cfg.phoneModel || phone.models[0] || "", detail: phone.ok ? `${phone.models.length} model(s) · ${phone.ms} ms` : phone.error ?? "" },
    { kind: "browser", ready: browserModelLoaded(cfg.browserModel), model: cfg.browserModel, detail: browserModelLoaded(cfg.browserModel) ? "Loaded in memory" : hasWebGPU() ? "Not loaded yet" : "WebGPU not available" },
    { kind: "laptop", ready: laptop.ok, model: cfg.laptopModel || laptop.models[0] || "", detail: laptop.ok ? `${laptop.models.length} model(s) · ${laptop.ms} ms` : laptop.error ?? "" },
  ];
}

function order(cfg: AiConfig, heavy: boolean): EngineKind[] {
  if (cfg.mode === "off" || cfg.mode === "rules") return [];
  if (cfg.mode !== "auto") return [cfg.mode];
  // heavy = longer generations: prefer the laptop's bigger model when it is paired
  return heavy ? ["laptop", "phone-npu", "browser"] : ["phone-npu", "browser", "laptop"];
}

/** Run a prompt on the best available local engine. Throws when no model engine is available. */
export async function run(messages: ChatMsg[], opts: { maxTokens?: number; json?: boolean; heavy?: boolean } = {}): Promise<AiResult> {
  const cfg = loadConfig();
  const states = await availability(cfg);
  const maxTokens = opts.maxTokens ?? 200;
  let lastErr: unknown = new Error("No local model is available");
  for (const kind of order(cfg, !!opts.heavy)) {
    const st = states.find((s) => s.kind === kind);
    if (!st?.ready) continue;
    const t0 = performance.now();
    try {
      const out = kind === "browser" ? await chatBrowser(messages, maxTokens, !!opts.json)
        : kind === "phone-npu" ? await chatOpenAI(cfg.phoneUrl, st.model, "", messages, maxTokens, !!opts.json)
        : await chatOpenAI(cfg.laptopUrl, st.model, cfg.laptopKey, messages, maxTokens, !!opts.json);
      if (!out.text.trim()) throw new Error("Empty answer");
      return { ...out, engine: kind, model: st.model, ms: Math.round(performance.now() - t0) };
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}
