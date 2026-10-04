"use client";
import Link from "next/link";
import { useState } from "react";
import { Cpu, Loader2, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { ENGINE_LABEL, type EngineKind } from "@/lib/edgeai/engine";

export interface AiRun { engine: EngineKind; model: string; ms: number; chips?: string[] }

export function EngineBadge({ run }: { run: AiRun }) {
  const { t } = useI18n();
  const tone = run.engine === "rules" ? "bg-ink-800 text-slate-400" : "bg-sky-500/15 text-sky-300";
  return (
    <Link href="/ai" className={`chip ${tone}`} title={run.model || undefined}>
      <Cpu size={11} />{t("ask.ranOn", { engine: ENGINE_LABEL[run.engine], ms: run.ms })}
    </Link>
  );
}

/** Natural-language request box. The text is understood by a model running on this device. */
export default function AskBox({ onAsk, last, disabled }: { onAsk: (text: string) => Promise<void>; last: AiRun | null; disabled?: boolean }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 3 || busy) return;
    setBusy(true);
    try { await onAsk(q.trim()); } finally { setBusy(false); }
  }
  return (
    <section className="card p-3">
      <form onSubmit={go} className="flex gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-ink-700 bg-ink-850 px-3 focus-within:border-sky-400/70">
          <Sparkles size={16} className="shrink-0 text-sky-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={300} enterKeyHint="send"
            placeholder={t("ask.placeholder")} aria-label={t("ask.placeholder")} className="w-full bg-transparent py-2.5 text-sm outline-none" />
        </div>
        <button className="btn-ghost !px-3.5" disabled={busy || disabled || q.trim().length < 3}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : t("ask.go")}
        </button>
      </form>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
        {last ? (
          <>
            <EngineBadge run={last} />
            {last.chips?.map((c) => <span key={c} className="chip bg-ink-800 text-slate-300">{c}</span>)}
          </>
        ) : <span className="flex items-center gap-1"><Cpu size={11} />{t("ask.local")}</span>}
      </div>
    </section>
  );
}
