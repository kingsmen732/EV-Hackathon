"use client";
import { BatteryCharging, Car, CheckCircle2, Hourglass, Leaf, ShieldCheck, Truck, X } from "lucide-react";
import type { Driver } from "@/lib/types";
import { inr, mins } from "@/lib/format";
import { useI18n, type Key } from "@/lib/i18n";

const STEPS = ["scheduled", "en_route", "queued", "charging", "completed"] as const;
const CONN: Record<string, string> = { CCS2: "CCS2", TYPE2: "Type 2", GBT: "Bharat DC-001", BAC001: "Bharat AC-001", LECCS: "LECCS" };

export default function TripCard({ d, onCancel, onStop, onDone, busy }: {
  d: Driver; onCancel: () => void; onStop: () => void; onDone: () => void; busy?: boolean;
}) {
  const { t } = useI18n();
  const r = d.reservation;
  if (d.rescue) {
    return (
      <section className="card border-sky-500/40 p-4" aria-live="polite">
        <h2 className="flex items-center gap-2 font-semibold"><Truck size={18} className="text-sky-400" />{t("rescue.title", { id: d.rescue.unit })}</h2>
        <p className="mt-2 text-sm text-slate-300">
          {d.rescue.status === "dispatched" && t("rescue.onWay", { t: mins(d.rescue.eta_in) })}
          {d.rescue.status === "charging" && t("rescue.charging", { kwh: d.rescue.delivered_kwh, pct: Math.round(d.soc) })}
        </p>
        <SocBar soc={d.soc} target={30} />
      </section>
    );
  }
  if (!r || r.status === "cancelled") return null;
  const idx = STEPS.indexOf(r.status as (typeof STEPS)[number]);

  return (
    <section className="card overflow-hidden border-volt-500/40" aria-live="polite">
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="label">{t("trip.title")}</div>
            <h2 className="truncate text-lg font-semibold">{r.station}</h2>
            <p className="text-xs text-slate-400">{r.area} · {t("opt.bay", { b: r.charger_id.split("-").pop()! })} · {CONN[r.connector] ?? r.connector} · {t("trip.locked", { p: r.price })}</p>
          </div>
          {r.green_shift && <span className="chip bg-emerald-500/15 text-emerald-300"><Leaf size={11} />{t("opt.offpeak")}</span>}
        </div>

        <ol className="mt-4 flex items-center gap-1" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-1 flex-col items-center gap-1" aria-current={i === idx ? "step" : undefined}>
              <div className={`h-1.5 w-full rounded-full ${i <= idx ? "bg-volt-500" : "bg-ink-700"}`} />
              <span className={`text-[10px] ${i === idx ? "font-semibold text-white" : "text-slate-500"}`}>{t(`trip.s.${s}` as Key)}</span>
            </li>
          ))}
        </ol>

        <div className="mt-4 text-sm">
          {r.status === "scheduled" && <p className="flex items-center gap-2"><Hourglass size={16} className="shrink-0 text-emerald-400" />{t("trip.leaveIn", { t: mins(r.depart_in) })}</p>}
          {r.status === "en_route" && <p className="flex items-center gap-2"><Car size={16} className="shrink-0 text-sky-400" />{t("trip.arriving", { t: mins(r.eta_in), w: mins(r.est_wait) })}</p>}
          {r.status === "queued" && <p className="flex items-center gap-2"><ShieldCheck size={16} className="shrink-0 text-amp-400" />{t("trip.queued", { n: r.queue_pos ?? 1 })}</p>}
          {r.status === "charging" && d.session && (
            <div className="space-y-3">
              <p className="flex flex-wrap items-center gap-2">
                <BatteryCharging size={18} className="text-volt-400" />
                <b className="font-mono text-lg">{d.session.kw} kW</b>
                {d.session.throttled ? <span className="chip bg-amp-500/15 text-amp-400">{t("trip.slowed", { kw: d.session.req_kw })}</span>
                  : d.session.floor >= 1 ? <span className="chip bg-volt-500/15 text-volt-300">{t("trip.guarantee")}</span> : null}
              </p>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <Stat v={`${d.session.energy_kwh} kWh`} k={t("trip.delivered")} />
                <Stat v={inr(d.session.cost)} k={t("trip.soFar")} />
                <Stat v={mins(d.session.elapsed)} k={t("trip.elapsed")} />
              </div>
            </div>
          )}
          {r.status === "completed" && (
            <div className="space-y-3">
              <p className="flex items-center gap-2"><CheckCircle2 size={18} className="text-volt-400" />{t("trip.ready", { pct: Math.round(d.soc) })}</p>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <Stat v={`${r.energy_kwh} kWh`} k={t("trip.delivered")} />
                <Stat v={inr(r.cost)} k={t("trip.paid")} />
                <Stat v={mins(r.actual_wait ?? 0)} k={t("trip.waited")} />
              </div>
            </div>
          )}
        </div>

        {r.status !== "completed" && <SocBar soc={d.soc} target={d.target_soc} />}
      </div>

      {(r.status === "scheduled" || r.status === "en_route" || r.status === "queued") &&
        <button className="btn-danger w-full !rounded-none !border-x-0 !border-b-0 !py-3" disabled={busy} onClick={onCancel}><X size={16} />{t("trip.cancel")}</button>}
      {r.status === "charging" && <button className="btn-ghost w-full !rounded-none !border-x-0 !border-b-0 !py-3" disabled={busy} onClick={onStop}>{t("trip.stop")}</button>}
      {r.status === "completed" && <button className="btn-primary w-full !rounded-none !py-3" onClick={onDone}>{t("trip.next")}</button>}
    </section>
  );
}

function Stat({ v, k }: { v: string; k: string }) {
  return <div className="rounded-lg bg-ink-850 py-2"><div className="font-mono text-sm font-semibold">{v}</div><div className="text-[10px] text-slate-500">{k}</div></div>;
}

export function SocBar({ soc, target }: { soc: number; target: number }) {
  const { t } = useI18n();
  const tone = soc < 15 ? "#f04d4d" : soc < 30 ? "#f5a524" : "#1fd084";
  return (
    <div className="mt-4">
      <div className="relative h-3 overflow-hidden rounded-full bg-ink-800" role="progressbar" aria-valuenow={Math.round(soc)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${soc}%`, background: tone }} />
        <div className="absolute top-0 h-full w-0.5 bg-white/60" style={{ left: `${target}%` }} />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[11px] text-slate-400"><span>{soc.toFixed(0)}%</span><span>{t("trip.target", { pct: target })}</span></div>
    </div>
  );
}
