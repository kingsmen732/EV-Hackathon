"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BatteryMedium, Crosshair, LocateFixed, MapPin, Search, Target } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { GarageVehicle, Station } from "@/lib/types";

export interface DriveValue { soc: number; target_soc: number; lat: number; lon: number }

const CONN: Record<string, string> = { CCS2: "CCS2", TYPE2: "Type 2", GBT: "Bharat DC-001", BAC001: "Bharat AC-001", LECCS: "LECCS" };

export default function DriverSetup({
  vehicle, vehicles, onSwitch, stations, pickedLoc, picking, onTogglePick, onSubmit, onCancel, busy, lockTrip, initial,
}: {
  vehicle: GarageVehicle; vehicles: GarageVehicle[]; onSwitch: (gid: string) => void; stations: Station[];
  pickedLoc: { lat: number; lon: number } | null; picking: boolean; onTogglePick: () => void;
  onSubmit: (v: DriveValue) => void; onCancel?: () => void; busy?: boolean; lockTrip?: boolean;
  initial?: Partial<DriveValue> | null;
}) {
  const { t } = useI18n();
  const [v, setV] = useState<DriveValue>({
    soc: Math.round(initial?.soc ?? 32), target_soc: initial?.target_soc ?? 80,
    lat: initial?.lat ?? 13.0512, lon: initial?.lon ?? 80.2215,
  });
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ label: string; lat: number; lon: number }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [placeLabel, setPlaceLabel] = useState<string | null>(initial?.lat ? null : null);

  useEffect(() => { if (pickedLoc) { setV((x) => ({ ...x, ...pickedLoc })); setPlaceLabel(t("setup.pinned")); } }, [pickedLoc]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (q.trim().length < 3) { setHits([]); return; }
    const h = setTimeout(async () => {
      try {
        const r = await api<{ results: { label: string; lat: number; lon: number }[] }>(
          `/geo/search?q=${encodeURIComponent(q)}&lat=${v.lat}&lon=${v.lon}`);
        const local = stations.filter((s) => s.kind === "public" && (s.area + " " + s.name).toLowerCase().includes(q.toLowerCase()))
          .map((s) => ({ label: `${s.area} · ${s.name}`, lat: s.lat + 0.006, lon: s.lon - 0.006 }));
        setHits([...r.results, ...local].slice(0, 7));
      } catch { setHits([]); }
    }, 300);
    return () => clearTimeout(h);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const p = vehicle.profile;
  const range = (v.soc / 100) * p.usable_kwh / p.kwh_per_km;
  const socTone = v.soc < 15 ? "accent-surge-500" : v.soc < 30 ? "accent-amp-500" : "accent-volt-500";

  function gps() {
    if (!navigator.geolocation) return setMsg(t("setup.noGps"));
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      if (latitude > 12.8 && latitude < 13.25 && longitude > 80.0 && longitude < 80.35) {
        setV((x) => ({ ...x, lat: latitude, lon: longitude })); setPlaceLabel(t("setup.gps")); setMsg(null);
      } else setMsg(t("setup.outside"));
    }, () => setMsg(t("setup.denied")), { timeout: 8000 });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-850 p-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-volt-500/15 text-volt-400"><BatteryMedium size={20} /></div>
        <div className="min-w-0 flex-1">
          {vehicles.length > 1 && !lockTrip ? (
            <select aria-label={t("setup.vehicle")} value={vehicle.id} onChange={(e) => onSwitch(e.target.value)} className="w-full truncate bg-transparent font-semibold outline-none">
              {vehicles.map((g) => <option key={g.id} value={g.id} className="bg-ink-900">{g.nickname || `${g.make} ${g.model}`}</option>)}
            </select>
          ) : <div className="truncate font-semibold">{vehicle.nickname || `${vehicle.make} ${vehicle.model}`}</div>}
          <div className="truncate text-[11px] text-slate-400">
            {t("ev.usable", { kwh: p.usable_kwh })} · {p.dc_capable ? `${p.eff_dc_kw} kW DC` : t("ev.acOnly")} · {vehicle.connectors.map((c) => CONN[c] ?? c).join(", ")}
          </div>
        </div>
        <Link href="/garage" className="shrink-0 text-xs font-medium text-volt-400 hover:underline">{t("nav.garage")}</Link>
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <label htmlFor="soc" className="text-sm font-medium">{t("setup.batteryNow")}</label>
          <span className="font-mono text-lg font-semibold">{v.soc}%<span className="ml-2 text-xs font-normal text-slate-400">{t("setup.range", { km: Math.round(range) })}</span></span>
        </div>
        <input id="soc" type="range" min={2} max={95} value={v.soc} disabled={lockTrip} onChange={(e) => setV({ ...v, soc: +e.target.value })} className={`h-2 w-full ${socTone}`} />
      </div>
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <label htmlFor="tgt" className="flex items-center gap-1.5 text-sm font-medium"><Target size={14} className="text-slate-400" />{t("setup.chargeTo")}</label>
          <span className="font-mono text-lg font-semibold">{v.target_soc}%</span>
        </div>
        <input id="tgt" type="range" min={40} max={100} step={5} value={v.target_soc} onChange={(e) => setV({ ...v, target_soc: +e.target.value })} className="h-2 w-full accent-volt-500" />
        {v.target_soc > p.taper_knee && <p className="mt-1.5 text-xs text-slate-400">{t("setup.slowAbove", { pct: Math.round(p.taper_knee) })}</p>}
      </div>

      {!lockTrip && (
        <div>
          <div className="mb-2 text-sm font-medium">{t("setup.start")}</div>
          <div className="relative flex gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-ink-700 bg-ink-850 px-3 focus-within:border-volt-500/70">
              <Search size={16} className="shrink-0 text-slate-500" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("setup.search")} aria-label={t("setup.search")}
                className="w-full bg-transparent py-2.5 text-sm outline-none" />
            </div>
            <button type="button" className={picking ? "btn-primary !px-3" : "btn-ghost !px-3"} onClick={onTogglePick} title={t("setup.tapMap")} aria-label={t("setup.tapMap")} aria-pressed={picking}><Crosshair size={17} /></button>
            <button type="button" className="btn-ghost !px-3" onClick={gps} title={t("setup.gps")} aria-label={t("setup.gps")}><LocateFixed size={17} /></button>
            {hits.length > 0 && (
              <ul role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">
                {hits.map((h, i) => (
                  <li key={i}>
                    <button type="button" className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm hover:bg-ink-800"
                      onClick={() => { setV({ ...v, lat: h.lat, lon: h.lon }); setPlaceLabel(h.label); setQ(""); setHits([]); }}>
                      <MapPin size={14} className="mt-0.5 shrink-0 text-slate-500" />{h.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
            <MapPin size={12} className="text-sky-400" />
            <span className="truncate">{picking ? <span className="text-volt-400">{t("setup.tapMap")}</span> : placeLabel ?? t("setup.default")}</span>
          </div>
          {msg && <div className="mt-1 text-xs text-amp-400">{msg}</div>}
        </div>
      )}

      <div className="flex gap-2">
        {onCancel && <button className="btn-ghost flex-1" onClick={onCancel}>{t("common.cancel")}</button>}
        <button className="btn-primary flex-1 !py-3" disabled={busy} onClick={() => onSubmit(v)}>{lockTrip ? t("setup.updateTarget") : t("setup.go")}</button>
      </div>
    </div>
  );
}
