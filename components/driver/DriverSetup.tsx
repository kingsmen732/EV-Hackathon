"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BatteryMedium, LocateFixed, Target } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { GarageVehicle } from "@/lib/types";

export interface DriveValue { soc: number; target_soc: number; lat: number; lon: number }

const CONN: Record<string, string> = { CCS2: "CCS2", TYPE2: "Type 2", GBT: "Bharat DC-001", BAC001: "Bharat AC-001", LECCS: "LECCS" };

export default function DriverSetup({
  vehicle, vehicles, onSwitch, onSubmit, onCancel, busy, lockTrip, initial, gpsLoc, onLocate, geoStatus, demo,
}: {
  vehicle: GarageVehicle; vehicles: GarageVehicle[]; onSwitch: (gid: string) => void;
  onSubmit: (v: DriveValue) => void; onCancel?: () => void; busy?: boolean; lockTrip?: boolean;
  initial?: Partial<DriveValue> | null;
  /** Live device location when it is inside the service area. */
  gpsLoc?: { lat: number; lon: number } | null; onLocate?: () => void; geoStatus?: string; demo?: boolean;
}) {
  const { t } = useI18n();
  const [v, setV] = useState<DriveValue>({
    soc: Math.round(initial?.soc ?? 32), target_soc: initial?.target_soc ?? 80,
    lat: initial?.lat ?? 13.0512, lon: initial?.lon ?? 80.2215,
  });
  // the start is always the device's live location
  useEffect(() => { if (gpsLoc && !lockTrip) setV((x) => ({ ...x, lat: gpsLoc.lat, lon: gpsLoc.lon })); }, [gpsLoc?.lat, gpsLoc?.lon, lockTrip]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!gpsLoc) onLocate?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const located = !!gpsLoc;
  const startMsg = geoStatus === "denied" ? t("setup.denied") : geoStatus === "insecure" ? t("gps.insecure")
    : geoStatus === "unavailable" ? t("setup.noGps") : geoStatus === "on" ? t("setup.outside") : t("gps.locating");

  const p = vehicle.profile;
  const range = (v.soc / 100) * p.usable_kwh / p.kwh_per_km;
  const socTone = v.soc < 15 ? "accent-surge-500" : v.soc < 30 ? "accent-amp-500" : "accent-volt-500";

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
          <div className="flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-850 px-3 py-2.5 text-sm">
            <LocateFixed size={16} className={`shrink-0 ${located ? "text-sky-400" : "text-slate-500"}`} />
            <span className="min-w-0 flex-1">
              {located ? t("setup.gps") : geoStatus === "locating" || geoStatus === "idle" ? t("gps.locating") : startMsg}
            </span>
            {!located && <button type="button" className="shrink-0 text-xs font-medium text-volt-400 hover:underline" onClick={onLocate}>{t("gps.retry")}</button>}
          </div>
          {located && demo && <div className="mt-1 text-xs text-amp-400">{t("gps.demo")}</div>}
        </div>
      )}

      <div className="flex gap-2">
        {onCancel && <button className="btn-ghost flex-1" onClick={onCancel}>{t("common.cancel")}</button>}
        <button className="btn-primary flex-1 !py-3" disabled={busy || (!lockTrip && !located)} onClick={() => onSubmit(v)}>{lockTrip ? t("setup.updateTarget") : t("setup.go")}</button>
      </div>
    </div>
  );
}
