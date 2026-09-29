"use client";
import { useState } from "react";
import { ChevronDown, Clock, Gauge, Leaf, MapPin, Navigation, PlugZap, Users } from "lucide-react";
import type { MatchOption } from "@/lib/types";
import { inr, mins } from "@/lib/format";
import { useI18n, type Key } from "@/lib/i18n";

const CONN: Record<string, string> = { CCS2: "CCS2", TYPE2: "Type 2", GBT: "Bharat DC-001", BAC001: "Bharat AC-001", LECCS: "LECCS" };
const TAGS: Record<string, { k: Key; cls: string }> = {
  "Best match": { k: "opt.best", cls: "bg-volt-500 text-ink-950" },
  Fastest: { k: "opt.fastest", cls: "bg-sky-500/15 text-sky-300" },
  Cheapest: { k: "opt.cheapest", cls: "bg-amp-500/15 text-amp-400" },
  "Grid friendly": { k: "opt.grid", cls: "bg-volt-500/15 text-volt-300" },
  "Green window": { k: "opt.offpeak", cls: "bg-emerald-500/15 text-emerald-300" },
};

export default function OptionCard({ o, onReserve, onHover, busy, primary }: {
  o: MatchOption; onReserve: () => void; onHover?: (on: boolean) => void; busy?: boolean; primary?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const segs = [
    { k: t("opt.later"), v: o.depart_delay, c: "#334155" },
    { k: t("opt.drive"), v: o.travel_min, c: "#38bdf8" },
    { k: t("opt.wait"), v: o.wait_min, c: "#f5a524" },
    { k: t("opt.charge"), v: o.charge_min, c: "#1fd084" },
  ].filter((s) => s.v > 0.4);
  const total = segs.reduce((a, s) => a + s.v, 0) || 1;
  const limited = o.delivered_kw < o.charger_kw - 0.5;

  const why: { icon: React.ElementType; text: string; tone?: string }[] = [
    o.wait_min <= 2 ? { icon: Clock, text: t("why.free"), tone: "text-volt-400" } : { icon: Clock, text: t("why.wait", { m: Math.round(o.wait_min) }), tone: "text-amp-400" },
    { icon: Navigation, text: t(o.live_route ? "why.driveLive" : "why.drive", { km: o.distance_km, m: Math.round(o.travel_min) }), tone: "text-sky-400" },
    o.grid_util >= 0.9 && o.throttle < 0.99
      ? { icon: Gauge, text: t("why.gridBusy", { pct: Math.round(o.grid_util * 100), s: Math.round(o.throttle * 100) }), tone: "text-amp-400" }
      : { icon: Gauge, text: t("why.gridOk"), tone: "text-volt-400" },
  ];
  if (o.depart_delay > 0) why.unshift({ icon: Leaf, text: t("why.offpeak", { m: o.depart_delay }), tone: "text-emerald-400" });

  return (
    <article className={`card overflow-hidden transition ${primary ? "border-volt-500/60 shadow-[0_0_0_1px_rgba(31,208,132,.15)]" : ""}`}
      onMouseEnter={() => onHover?.(true)} onMouseLeave={() => onHover?.(false)}>
      <div className="p-4">
        <div className="flex flex-wrap gap-1">
          {o.tags.map((tag) => TAGS[tag] && <span key={tag} className={`chip ${TAGS[tag].cls}`}>{t(TAGS[tag].k)}</span>)}
          {o.kind === "shared" && <span className="chip bg-share-500/15 text-share-400"><Users size={11} />{t("opt.shared")}</span>}
        </div>

        <div className="mt-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold">{o.name}</h3>
            <p className="flex items-center gap-1 text-xs text-slate-400"><MapPin size={12} />{o.area} · {t("opt.away", { km: o.distance_km })}</p>
          </div>
          <div className="shrink-0 rounded-lg bg-ink-850 px-2.5 py-1 text-right text-sm font-semibold text-volt-300">
            {t("opt.readyIn", { t: mins(o.total_min) })}
          </div>
        </div>

        <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-ink-800" aria-hidden>
          {segs.map((s) => <div key={s.k} style={{ width: `${(s.v / total) * 100}%`, background: s.c }} />)}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
          {segs.map((s) => <span key={s.k}><i className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: s.c }} />{s.k} {mins(s.v)}</span>)}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat v={inr(o.est_cost)} k={t("opt.cost")} sub={`₹${o.price_per_kwh}/kWh`} />
          <Stat v={`${Math.round(o.arrive_soc)}%`} k={t("opt.arrive")} />
          <Stat v={`${Math.round(o.delivered_kw)} kW`} k={t("opt.speed")} tone={limited ? "text-amp-400" : "text-volt-400"} />
        </div>

        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400">
          <PlugZap size={12} className="text-slate-500" />
          {t("opt.bay", { b: o.charger_id.split("-").pop()! })} · {CONN[o.connector] ?? o.connector} {o.charger_kw} kW ·{" "}
          <span className={limited ? "text-amp-400" : "text-volt-400"}>{limited ? t("opt.limited", { kw: Math.round(o.delivered_kw) }) : t("opt.fullSpeed")}</span>
        </p>

        <button className="mt-3 flex w-full items-center justify-between text-xs text-slate-400 hover:text-slate-200" onClick={() => setOpen(!open)} aria-expanded={open}>
          {t("opt.why")} <ChevronDown size={14} className={open ? "rotate-180 transition" : "transition"} />
        </button>
        {open && (
          <ul className="mt-2 space-y-1.5 text-xs text-slate-300">
            {why.map((w, i) => (
              <li key={i} className="flex gap-2"><w.icon size={13} className={`mt-0.5 shrink-0 ${w.tone ?? ""}`} />{w.text}</li>
            ))}
          </ul>
        )}
      </div>
      <button className={`${primary ? "btn-primary" : "btn-ghost"} w-full !rounded-none !py-3`} disabled={busy} onClick={onReserve}>
        {o.depart_delay > 0 ? t("opt.reserveLater", { m: o.depart_delay }) : t("opt.reserve")}
      </button>
    </article>
  );
}

function Stat({ v, k, sub, tone }: { v: string; k: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-ink-850 py-2">
      <div className={`font-mono text-sm font-semibold ${tone ?? ""}`}>{v}</div>
      <div className="text-[10px] text-slate-500">{k}</div>
      {sub && <div className="text-[10px] text-slate-600">{sub}</div>}
    </div>
  );
}
