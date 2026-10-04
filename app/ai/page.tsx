"use client";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Cpu, Download, Laptop, Loader2, RefreshCw, ShieldCheck, Smartphone, XCircle } from "lucide-react";
import {
  type AiConfig, type AiMode, type EngineState, BROWSER_MODELS, ENGINE_LABEL, PHONE_PRESETS,
  availability, browserModelCached, hasWebGPU, loadBrowserModel, loadConfig, run, saveConfig,
} from "@/lib/edgeai/engine";
import { parseIntent } from "@/lib/edgeai/tasks";

const MODES: { id: AiMode; label: string }[] = [
  { id: "auto", label: "Automatic (phone first)" }, { id: "phone-npu", label: "Phone NPU only" },
  { id: "browser", label: "In-app model only" }, { id: "laptop", label: "Laptop only" }, { id: "rules", label: "No model (rules)" },
];
const ICON = { "phone-npu": Cpu, browser: Smartphone, laptop: Laptop, rules: ShieldCheck };

export default function AiPage() {
  const [cfg, setCfg] = useState<AiConfig | null>(null);
  const [states, setStates] = useState<EngineState[]>([]);
  const [checking, setChecking] = useState(false);
  const [dl, setDl] = useState<{ pct: number; text: string } | null>(null);
  const [cached, setCached] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("cheapest charge on the way to Tambaram, I can wait an hour");
  const [out, setOut] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => { setCfg(loadConfig()); }, []);
  const refresh = useCallback(async (c: AiConfig, fresh = true) => {
    setChecking(true);
    try { setStates(await availability(c, fresh)); setCached(await browserModelCached(c.browserModel)); }
    finally { setChecking(false); }
  }, []);
  useEffect(() => { if (cfg) refresh(cfg, false); }, [cfg === null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cfg) return null;
  const set = (patch: Partial<AiConfig>) => { const n = { ...cfg, ...patch }; setCfg(n); saveConfig(n); return n; };

  async function download() {
    setErr(null); setDl({ pct: 0, text: "Starting…" });
    try { await loadBrowserModel(cfg!.browserModel, (pct, text) => setDl({ pct, text })); await refresh(cfg!); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setDl(null); }
  }

  async function test(kind: "intent" | "chat") {
    setTesting(true); setOut(null); setErr(null);
    try {
      if (kind === "intent") {
        const r = await parseIntent(prompt, ["Tambaram", "Adyar", "Guindy", "Velachery", "Anna Nagar", "T. Nagar", "OMR"]);
        setOut(`${JSON.stringify(r.intent, null, 2)}\n\n${ENGINE_LABEL[r.engine]}${r.model ? ` · ${r.model}` : ""} · ${r.ms} ms`);
      } else {
        const r = await run([{ role: "user", content: prompt }], { maxTokens: 120 });
        setOut(`${r.text.trim()}\n\n${ENGINE_LABEL[r.engine]} · ${r.model} · ${r.ms} ms${r.tokens ? ` · ${(r.tokens / (r.ms / 1000)).toFixed(1)} tok/s` : ""}`);
      }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setTesting(false); }
  }

  const st = (k: string) => states.find((s) => s.kind === k);
  const Row = ({ k }: { k: "phone-npu" | "browser" | "laptop" }) => {
    const s = st(k); const I = ICON[k];
    return (
      <div className="flex items-center gap-3">
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${s?.ready ? "bg-volt-500/15 text-volt-400" : "bg-ink-800 text-slate-500"}`}><I size={18} /></div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{ENGINE_LABEL[k]}</div>
          <div className="truncate text-xs text-slate-400">{s?.ready && s.model ? `${s.model} · ` : ""}{s?.detail ?? "…"}</div>
        </div>
        {s?.ready ? <CheckCircle2 size={18} className="shrink-0 text-volt-400" /> : <XCircle size={18} className="shrink-0 text-slate-600" />}
      </div>
    );
  };
  const input = "w-full rounded-xl border border-ink-700 bg-ink-850 px-3 py-2.5 text-sm outline-none focus:border-volt-500/70";

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4 pb-24">
      <header>
        <h1 className="text-xl font-semibold">On-device AI</h1>
        <p className="mt-1 text-sm text-slate-400">ChargeMesh understands your requests and explains its picks with open-source models that run on your phone. Nothing you type is sent to a cloud AI service.</p>
      </header>

      <section className="card space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Engines</h2>
          <button className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={() => refresh(cfg)} disabled={checking}>
            {checking ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}Check again
          </button>
        </div>
        <Row k="phone-npu" /><Row k="browser" /><Row k="laptop" />
        <label className="block text-sm">
          <span className="label mb-1 block">Use</span>
          <select className={input} value={cfg.mode} onChange={(e) => set({ mode: e.target.value as AiMode })}>
            {MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
        <p className="text-xs text-slate-500">Automatic tries the phone's NPU first, then the in-app model, then the paired laptop. Longer explanations prefer the laptop when it is paired. With no model at all, built-in rules still handle requests.</p>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="flex items-center gap-2 font-semibold"><Cpu size={17} className="text-volt-400" />Phone · Snapdragon NPU</h2>
        <p className="text-xs text-slate-400">A model server running on this phone (Qualcomm GenieAPIService or GenieX) executes the model on the Hexagon NPU and listens on a local address. ChargeMesh talks to it over loopback only.</p>
        <select className={input} value={PHONE_PRESETS.some((p) => p.url === cfg.phoneUrl) ? cfg.phoneUrl : ""} onChange={(e) => e.target.value && refresh(set({ phoneUrl: e.target.value }))}>
          {PHONE_PRESETS.map((p) => <option key={p.url} value={p.url}>{p.label} — {p.url}</option>)}
          <option value="">Custom address</option>
        </select>
        <input className={input} value={cfg.phoneUrl} onChange={(e) => set({ phoneUrl: e.target.value })} onBlur={() => refresh(cfg)} placeholder="http://127.0.0.1:8910/v1" aria-label="Phone model server address" inputMode="url" />
        <input className={input} value={cfg.phoneModel} onChange={(e) => set({ phoneModel: e.target.value })} placeholder={`Model name (default: ${st("phone-npu")?.model || "first one the server lists"})`} aria-label="Phone model name" />
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="flex items-center gap-2 font-semibold"><Smartphone size={17} className="text-sky-400" />Phone · in-app model</h2>
        <p className="text-xs text-slate-400">No install needed. The model is downloaded once, stored on the phone and runs inside the app on the Adreno GPU (WebGPU). Works offline afterwards.</p>
        <select className={input} value={cfg.browserModel} onChange={(e) => refresh(set({ browserModel: e.target.value }))}>
          {BROWSER_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label} · {m.size}</option>)}
        </select>
        {dl ? (
          <div>
            <div className="h-2 overflow-hidden rounded-full bg-ink-800"><div className="h-full bg-sky-400 transition-all" style={{ width: `${dl.pct}%` }} /></div>
            <div className="mt-1 truncate text-xs text-slate-400">{dl.pct}% · {dl.text}</div>
          </div>
        ) : st("browser")?.ready ? (
          <div className="text-xs text-volt-300">Loaded and ready.</div>
        ) : (
          <button className="btn-primary w-full" onClick={download} disabled={!hasWebGPU()}>
            <Download size={16} />{cached ? "Load model (already on this phone)" : "Download and load model"}
          </button>
        )}
        {!hasWebGPU() && <p className="text-xs text-amp-400">This browser doesn't expose WebGPU. Use Chrome 121 or newer on Android.</p>}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="flex items-center gap-2 font-semibold"><Laptop size={17} className="text-amp-400" />Laptop · Office Kit link</h2>
        <p className="text-xs text-slate-400">For deeper compute, run the bridge on your laptop (<code className="text-slate-300">node tools/laptop-bridge.mjs</code>). It prints a link — copy it on the laptop, and Office Kit's shared clipboard lets you paste it here on the phone.</p>
        <input className={input} value={cfg.laptopUrl} onChange={(e) => set({ laptopUrl: e.target.value })} onBlur={() => refresh(cfg)} placeholder="Paste the bridge link, e.g. http://127.0.0.1:8787/v1" aria-label="Laptop bridge address" inputMode="url" />
        <div className="grid grid-cols-2 gap-2">
          <input className={input} value={cfg.laptopModel} onChange={(e) => set({ laptopModel: e.target.value })} placeholder={`Model (${st("laptop")?.model || "auto"})`} aria-label="Laptop model name" />
          <input className={input} value={cfg.laptopKey} onChange={(e) => set({ laptopKey: e.target.value })} placeholder="Pairing code" aria-label="Pairing code" />
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">Try it</h2>
        <textarea className={`${input} min-h-20`} value={prompt} onChange={(e) => setPrompt(e.target.value)} aria-label="Test prompt" />
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primary" disabled={testing} onClick={() => test("intent")}>{testing ? <Loader2 size={16} className="animate-spin" /> : null}Understand request</button>
          <button className="btn-ghost" disabled={testing} onClick={() => test("chat")}>Raw model answer</button>
        </div>
        {out && <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-ink-700 bg-ink-900 p-3 text-xs text-slate-200">{out}</pre>}
        {err && <div className="rounded-xl border border-surge-500/40 bg-surge-500/5 px-3 py-2 text-xs text-surge-400">{err}</div>}
      </section>

      <p className="flex items-start gap-2 px-1 text-xs text-slate-500"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-volt-400" />Station matching, pricing and routing run on the ChargeMesh server. Language understanding and explanations run locally on the engines above.</p>
    </main>
  );
}
