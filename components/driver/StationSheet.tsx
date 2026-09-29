"use client";
import { Check, Users, X } from "lucide-react";
import type { GarageVehicle, Station } from "@/lib/types";
import { mins, waitTone, TONE_HEX } from "@/lib/format";
import { usePoll } from "@/lib/usePoll";
import { useI18n, type Key } from "@/lib/i18n";

const DCC = new Set(["CCS2", "GBT", "LECCS"]);
const STATUS: Record<string, { c: string; k: Key }> = {
  free: { c: "#1fd084", k: "st.free" }, charging: { c: "#38bdf8", k: "st.charging" },
  reserved: { c: "#9a7bff", k: "st.reserved" }, offline: { c: "#475569", k: "st.offline" },
};

export default function StationSheet({ id, vehicle, onClose }: { id: string; vehicle?: GarageVehicle | null; onClose: () => void }) {
  const { t } = useI18n();
  const { data: s } = usePoll<Station>(`/stations/${id}`, 6000);
  if (!s) return <div className="card space-y-3 p-4"><div className="skeleton h-5 w-2/3" /><div className="skeleton h-16" /><div className="skeleton h-24" /></div>;

  const fits = (c: Station["chargers"][number]) => !vehicle || (vehicle.connectors.includes(c.connector) &&
    (DCC.has(c.connector) ? vehicle.max_dc_kw > 0 || c.connector === "LECCS" : vehicle.max_ac_kw > 0));
  const fc = (s.forecast ?? []).map((f) => {
    const w = [f.wait_dc, f.wait_ac].filter((x): x is number => x != null);
    return { clock: f.delta === 0 ? t("st.now") : `+${f.delta}m`, w: w.length ? Math.min(...w) : null };
  });
  const maxW = Math.max(10, ...fc.map((f) => f.w ?? 0));

  return (
    <section className="card p-4" aria-label={s.name}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{s.name}</h2>
          <p className="text-xs text-slate-400">
            {s.area} · {s.kind === "shared" ? <><Users size={11} className="inline" /> {t("st.host", { p: s.host_price ?? 0 })} · {s.open ? t("st.hours", { a: s.hours[0], b: s.hours[1] }) : t("st.closed")}</>
              : s.queue ? t("st.waiting", { n: s.queue }) : t("st.noWait")}
          </p>
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-ink-800" aria-label={t("common.close")}><X size={18} /></button>
      </div>

      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {s.chargers.map((c) => {
          const ok = fits(c);
          return (
            <li key={c.id} className={`rounded-xl border p-2.5 ${ok ? "border-ink-700 bg-ink-850" : "border-ink-800 bg-ink-900 opacity-60"}`}>
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold">{c.connector_name}</span>
                <span className="flex items-center gap-1" style={{ color: STATUS[c.status].c }}>
                  <i className="h-2 w-2 rounded-full" style={{ background: STATUS[c.status].c }} />{t(STATUS[c.status].k)}
                </span>
              </div>
              <div className="mt-0.5 font-mono text-sm">{c.kw} kW</div>
              <div className={`mt-0.5 flex items-center gap-1 text-[10px] ${ok ? "text-volt-400" : "text-slate-500"}`}>
                {ok ? <><Check size={11} />{t("st.fits")}</> : <><X size={11} />{t("st.noFit")}</>}
              </div>
            </li>
          );
        })}
      </ul>

      {fc.length > 0 && (
        <div className="mt-4">
          <div className="label mb-2">{t("st.next2h")}</div>
          <div className="flex h-24 items-end gap-1.5" role="img" aria-label={t("st.next2h")}>
            {fc.map((f, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <span className="font-mono text-[10px] text-slate-400">{f.w == null ? "—" : mins(f.w)}</span>
                <div className="w-full rounded-t-md" style={{ height: `${Math.max(6, ((f.w ?? 0) / maxW) * 64)}px`, background: TONE_HEX[waitTone(f.w)] }} />
                <span className="text-[10px] text-slate-500">{f.clock}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {s.pricing && (
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          {(["dc", "ac"] as const).map((k) => (
            <div key={k} className="rounded-xl bg-ink-850 p-2.5">
              <div className="text-slate-400">{t("st.price")} · {k.toUpperCase()}</div>
              <div className="font-mono text-sm font-semibold">₹{s.pricing![k].price}/kWh</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
