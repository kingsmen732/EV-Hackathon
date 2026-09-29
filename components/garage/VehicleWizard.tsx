"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BatteryCharging, Bike, Calendar, Car, Check, Loader2, PlugZap, Truck } from "lucide-react";
import { api } from "@/lib/api";
import type { Catalog, CatalogModel, GarageVehicle, GarageVehicleInput, User, VehicleProfile } from "@/lib/types";
import { useI18n, type Key } from "@/lib/i18n";

const STEPS: Key[] = ["wz.make", "wz.model", "wz.charging", "wz.age", "wz.review"];
const THIS_YEAR = new Date().getFullYear();
const VOLTAGES = [
  { v: 48, l: "48 V", d: "2-wheeler" },
  { v: 72, l: "72 V", d: "low-voltage fleet" },
  { v: 360, l: "400 V class", d: "most cars" },
  { v: 697, l: "800 V class", d: "Ioniq 5, EV6" },
];
const SEG_ICON = { car: Car, fleet: Truck, "2w": Bike } as const;

const blank: GarageVehicleInput = {
  catalog_key: null, make: "", model: "", variant: null, year: THIS_YEAR - 1, connectors: [],
  battery_kwh: 30, max_dc_kw: 50, max_ac_kw: 7.2, pack_voltage: 360, kwh_per_km: 0.14,
  odometer_km: null, nickname: null, registration: null,
};

export default function VehicleWizard({ initial, onSaved, onCancel }: {
  initial?: GarageVehicle | null; onSaved: (u: User) => void; onCancel?: () => void;
}) {
  const { t } = useI18n();
  const [cat, setCat] = useState<Catalog | null>(null);
  const [step, setStep] = useState(initial ? 2 : 0);
  const [v, setV] = useState<GarageVehicleInput>(() => {
    if (!initial) return blank;
    const { id: _id, profile: _p, ...rest } = initial;
    return rest;
  });
  const [custom, setCustom] = useState(!!initial && !initial.catalog_key);
  const [preview, setPreview] = useState<VehicleProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { api<Catalog>("/catalog").then(setCat).catch((e) => setErr(e.message)); }, []);

  const models = useMemo(() => cat?.models.filter((m) => m.make === v.make) ?? [], [cat, v.make]);
  const model = cat?.models.find((m) => m.key === v.catalog_key) ?? null;
  const set = (p: Partial<GarageVehicleInput>) => setV((x) => ({ ...x, ...p }));

  function pickModel(m: CatalogModel, variantIdx = 0) {
    const vr = m.variants[variantIdx];
    set({
      catalog_key: m.key, make: m.make, model: m.model, variant: vr.label, battery_kwh: vr.battery_kwh,
      max_dc_kw: vr.max_dc_kw, max_ac_kw: m.max_ac_kw, connectors: m.connectors, pack_voltage: m.pack_voltage,
      kwh_per_km: m.kwh_per_km, year: Math.max(m.since, Math.min(v.year, THIS_YEAR)),
    });
  }

  // live preview on the review step (and while editing numbers on step 3/4)
  useEffect(() => {
    if (step < 3 || !v.connectors.length || !v.battery_kwh) return;
    const t = setTimeout(() => {
      api<VehicleProfile>("/vehicles/preview", { method: "POST", json: {
        battery_kwh: v.battery_kwh, max_dc_kw: v.max_dc_kw, max_ac_kw: v.max_ac_kw, year: v.year,
        kwh_per_km: v.kwh_per_km, connectors: v.connectors, pack_voltage: v.pack_voltage, odometer_km: v.odometer_km,
      } }).then(setPreview).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [step, v]);

  const canNext = [
    !!v.make,
    !!v.model && (custom || !!v.catalog_key),
    v.connectors.length > 0 && (v.max_ac_kw > 0 || v.max_dc_kw > 0),
    v.year >= 2010 && v.year <= THIS_YEAR + 1 && v.battery_kwh > 0.5,
    true,
  ][step];

  async function save() {
    setBusy(true); setErr(null);
    try {
      const body = { ...v, nickname: v.nickname || null, registration: v.registration || null };
      const u = initial
        ? await api<User>(`/me/vehicles/${initial.id}`, { method: "PUT", json: body })
        : await api<User>("/me/vehicles", { method: "POST", json: body });
      onSaved(u);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("err.generic"));
    } finally { setBusy(false); }
  }

  if (!cat) return <div className="card p-6 text-sm text-slate-400">{err ?? t("common.loading")}</div>;
  const dcConns = new Set(cat.connectors.filter((c) => c.dc).map((c) => c.id));
  const hasDc = v.connectors.some((c) => dcConns.has(c));

  return (
    <div className="card overflow-hidden">
      {/* progress */}
      <div className="flex border-b border-ink-700">
        {STEPS.map((s, i) => (
          <button key={s} type="button" disabled={i > step && !canNext}
            onClick={() => i < step && setStep(i)}
            className={`flex-1 px-1 py-3 text-center text-[11px] sm:text-xs ${i === step ? "border-b-2 border-volt-500 text-white" : i < step ? "text-volt-400" : "text-slate-500"}`}>
            <span className="mr-1 font-mono">{i < step ? "✓" : i + 1}</span><span className={i === step ? "" : "hidden sm:inline"}>{t(s)}</span>
          </button>
        ))}
      </div>

      <div className="space-y-4 p-4 sm:p-6">
        {err && <div className="rounded-xl border border-surge-500/40 bg-surge-500/10 px-3 py-2 text-sm text-surge-400">{err}</div>}

        {step === 0 && (
          <>
            <Heading t={t("wz.qMake")} s={t("wz.qMakeSub")} />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {cat.makes.map((mk) => (
                <button key={mk} type="button" onClick={() => { setCustom(false); set({ make: mk, catalog_key: null, model: "" }); setStep(1); }}
                  className={`rounded-xl border px-3 py-4 text-left text-sm font-semibold transition ${v.make === mk && !custom ? "border-volt-500 bg-volt-500/10" : "border-ink-700 bg-ink-850 hover:border-ink-600"}`}>
                  {mk}
                  <span className="block text-[11px] font-normal text-slate-400">{t("wz.models", { n: cat.models.filter((m) => m.make === mk).length })}</span>
                </button>
              ))}
              <button type="button" onClick={() => { setCustom(true); set({ ...blank, make: "", catalog_key: null }); setStep(1); }}
                className={`rounded-xl border border-dashed px-3 py-4 text-left text-sm font-semibold ${custom ? "border-volt-500 bg-volt-500/10" : "border-ink-600 hover:border-slate-500"}`}>
                {t("wz.other")}<span className="block text-[11px] font-normal text-slate-400">{t("wz.otherSub")}</span>
              </button>
            </div>
          </>
        )}

        {step === 1 && (custom ? (
          <>
            <Heading t={t("wz.qCustom")} s="" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label={t("wz.make")} value={v.make} onChange={(x) => set({ make: x })} placeholder="e.g. BYD" />
              <Input label={t("wz.model")} value={v.model} onChange={(x) => set({ model: x })} placeholder="e.g. Sealion 7" />
              <Input label="Variant (optional)" value={v.variant ?? ""} onChange={(x) => set({ variant: x || null })} placeholder="e.g. Premium" />
            </div>
          </>
        ) : (
          <>
            <Heading t={t("wz.qModel", { make: v.make })} s={t("wz.qModelSub")} />
            <div className="space-y-2">
              {models.map((m) => {
                const I = SEG_ICON[m.segment];
                const on = v.catalog_key === m.key;
                return (
                  <div key={m.key} className={`rounded-xl border p-3 ${on ? "border-volt-500 bg-volt-500/5" : "border-ink-700 bg-ink-850"}`}>
                    <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => pickModel(m)}>
                      <I size={18} className="text-slate-400" />
                      <span className="flex-1 font-semibold">{m.model}</span>
                      <span className="text-[11px] text-slate-400">{m.connectors.map((c) => cat.connectors.find((x) => x.id === c)?.name).join(" + ")} · since {m.since}</span>
                    </button>
                    {on && (
                      <div className="mt-2 flex flex-wrap gap-2 pl-8">
                        {m.variants.map((vr, i) => (
                          <button key={vr.label} type="button" onClick={() => pickModel(m, i)}
                            className={`chip border px-3 py-1 text-xs ${v.variant === vr.label ? "border-volt-500 bg-volt-500 text-ink-950" : "border-ink-600 text-slate-300"}`}>
                            {vr.label}{vr.max_dc_kw ? ` · ${vr.max_dc_kw} kW DC` : " · AC only"}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ))}

        {step === 2 && (
          <>
            <Heading t={t("wz.qCharge")} s={t("wz.qChargeSub")} />
            <div className="grid gap-2 sm:grid-cols-2">
              {cat.connectors.map((c) => {
                const on = v.connectors.includes(c.id);
                return (
                  <button key={c.id} type="button"
                    onClick={() => set({ connectors: on ? v.connectors.filter((x) => x !== c.id) : [...v.connectors, c.id] })}
                    className={`rounded-xl border p-3 text-left transition ${on ? "border-volt-500 bg-volt-500/10" : "border-ink-700 bg-ink-850 hover:border-ink-600"}`}>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 font-semibold"><PlugZap size={16} className={c.dc ? "text-amp-400" : "text-sky-400"} />{c.name}</span>
                      <span className={`grid h-5 w-5 place-items-center rounded-md border ${on ? "border-volt-500 bg-volt-500 text-ink-950" : "border-ink-600"}`}>{on && <Check size={13} strokeWidth={3} />}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] font-medium text-slate-300">{c.kind}</div>
                    <div className="mt-1 text-[11px] leading-snug text-slate-400">{c.desc}</div>
                  </button>
                );
              })}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Num label={t("wz.dcRate")} value={v.max_dc_kw} onChange={(x) => set({ max_dc_kw: x })} step={1} disabled={!hasDc} hint={hasDc ? "peak the car accepts" : "no DC inlet selected"} />
              <Num label={t("wz.acRate")} value={v.max_ac_kw} onChange={(x) => set({ max_ac_kw: x })} step={0.1} hint="e.g. 3.3, 7.2, 11" />
              <label className="block">
                <span className="label">{t("wz.voltage")}</span>
                <select value={v.pack_voltage} onChange={(e) => set({ pack_voltage: +e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-ink-700 bg-ink-850 px-3 py-2.5 text-sm">
                  {[...VOLTAGES, ...(VOLTAGES.some((x) => x.v === v.pack_voltage) ? [] : [{ v: v.pack_voltage, l: `${v.pack_voltage} V`, d: "from catalogue" }])].map((x) =>
                    <option key={x.v} value={x.v}>{x.l} · {x.d}</option>)}
                </select>
                <span className="mt-1 block text-[10px] text-slate-500">affects current-limited DC chargers</span>
              </label>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <Heading t={t("wz.qAge")} s={t("wz.qAgeSub")} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label flex items-center gap-1"><Calendar size={12} />{t("wz.year")}</span>
                <select value={v.year} onChange={(e) => set({ year: +e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-ink-700 bg-ink-850 px-3 py-2.5 text-sm">
                  {Array.from({ length: THIS_YEAR + 1 - Math.max(2012, model?.since ?? 2012) + 1 }, (_, i) => THIS_YEAR + 1 - i).map((y) =>
                    <option key={y} value={y}>{y} · {t("wz.yrsOld", { n: Math.max(0, THIS_YEAR - y) })}</option>)}
                </select>
              </label>
              <Num label={t("wz.battery")} value={v.battery_kwh} onChange={(x) => set({ battery_kwh: x })} step={0.1}
                hint={model ? `catalogue: ${model.variants.map((x) => x.battery_kwh).join(" / ")} kWh` : "check your RC or brochure"} />
              <Num label={t("wz.odo")} value={v.odometer_km ?? 0} onChange={(x) => set({ odometer_km: x || null })} step={500} hint="high mileage adds wear" />
              <Num label={t("wz.eff")} value={v.kwh_per_km} onChange={(x) => set({ kwh_per_km: x })} step={0.005} hint="city driving average" />
              <Input label={t("wz.reg")} value={v.registration ?? ""} onChange={(x) => set({ registration: x.toUpperCase() || null })} placeholder="TN 09 AB 1234" />
              <Input label={t("wz.nick")} value={v.nickname ?? ""} onChange={(x) => set({ nickname: x || null })} placeholder="Daily driver" />
            </div>
            {preview && <ProfileStrip p={preview} />}
          </>
        )}

        {step === 4 && (
          <>
            <Heading t={t("wz.qReview")} s={t("wz.qReviewSub")} />
            <div className="rounded-xl border border-ink-700 bg-ink-850 p-4">
              <div className="text-lg font-semibold">{v.make} {v.model}</div>
              <div className="text-xs text-slate-400">{[v.variant, v.year, v.registration].filter(Boolean).join(" · ")}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {v.connectors.map((c) => <span key={c} className="chip bg-ink-700 text-slate-200">{cat.connectors.find((x) => x.id === c)?.name}</span>)}
                <span className="chip bg-ink-700 text-slate-200">{v.pack_voltage} V</span>
              </div>
            </div>
            {preview ? (
              <>
                <ProfileStrip p={preview} big />
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Stat v={`${preview.compatible_stations}`} k={t("wz.stations")} />
                  <Stat v={`${preview.compatible_bays}`} k={t("wz.bays")} />
                  <Stat v={preview.minutes_20_80 ? `${preview.minutes_20_80} min` : "—"} k={`${t("wz.time")} · ${preview.best_kw} kW`} />
                </div>
                {preview.notes.length > 0 && (
                  <ul className="space-y-1 text-xs text-slate-300">{preview.notes.map((n) => <li key={n} className="flex gap-2"><BatteryCharging size={13} className="mt-0.5 shrink-0 text-volt-400" />{n}</li>)}</ul>
                )}
                {preview.compatible_bays === 0 && <div className="rounded-xl border border-amp-500/40 bg-amp-500/10 p-3 text-xs text-amp-400">No bays in the network fit these connectors yet. You can still save; mobile top-ups remain available.</div>}
              </>
            ) : <div className="text-sm text-slate-400"><Loader2 size={14} className="mr-2 inline animate-spin" />Computing…</div>}
          </>
        )}
      </div>

      <div className="flex gap-2 border-t border-ink-700 p-4">
        {step > 0 ? <button type="button" className="btn-ghost" onClick={() => setStep(step - 1)}><ArrowLeft size={16} />{t("common.back")}</button>
          : onCancel ? <button type="button" className="btn-ghost" onClick={onCancel}>{t("common.cancel")}</button> : null}
        <div className="flex-1" />
        {step < 4 ? (
          <button type="button" className="btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>{t("common.continue")}<ArrowRight size={16} /></button>
        ) : (
          <button type="button" className="btn-primary" disabled={busy} onClick={save}>
            {busy && <Loader2 size={16} className="animate-spin" />}{initial ? t("wz.saveChanges") : t("wz.save")}
          </button>
        )}
      </div>
    </div>
  );
}

function Heading({ t, s }: { t: string; s: string }) {
  return <div><h2 className="text-lg font-semibold">{t}</h2><p className="text-sm text-slate-400">{s}</p></div>;
}

function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="mt-1.5 w-full rounded-xl border border-ink-700 bg-ink-850 px-3 py-2.5 text-sm outline-none focus:border-volt-500/70" />
    </label>
  );
}

function Num({ label, value, onChange, step, hint, disabled }: { label: string; value: number; onChange: (v: number) => void; step: number; hint?: string; disabled?: boolean }) {
  return (
    <label className={`block ${disabled ? "opacity-50" : ""}`}>
      <span className="label">{label}</span>
      <input type="number" inputMode="decimal" min={0} step={step} value={Number.isFinite(value) ? value : 0} disabled={disabled}
        onChange={(e) => onChange(e.target.value === "" ? 0 : +e.target.value)}
        className="mt-1.5 w-full rounded-xl border border-ink-700 bg-ink-850 px-3 py-2.5 font-mono text-sm outline-none focus:border-volt-500/70" />
      {hint && <span className="mt-1 block text-[10px] text-slate-500">{hint}</span>}
    </label>
  );
}

function Stat({ v, k }: { v: string; k: string }) {
  return <div className="rounded-lg bg-ink-850 px-2 py-2"><div className="font-mono text-base">{v}</div><div className="text-[10px] leading-tight text-slate-500">{k}</div></div>;
}

export function ProfileStrip({ p, big, compact }: { p: VehicleProfile; big?: boolean; compact?: boolean }) {
  const { t } = useI18n();
  const tone = p.soh >= 90 ? "text-volt-400" : p.soh >= 80 ? "text-amp-400" : "text-surge-400";
  return (
    <div className={`grid grid-cols-2 gap-2 ${compact ? "" : "sm:grid-cols-4"} ${big ? "" : "text-sm"}`}>
      <Stat v={`${p.soh}%`} k={t("wz.soh")} />
      <Stat v={`${p.usable_kwh} kWh`} k={t("wz.usable")} />
      <Stat v={p.dc_capable ? `${p.eff_dc_kw} kW` : "AC"} k={t("wz.dcPeak")} />
      <Stat v={`~${p.range_full_km} km`} k={t("wz.range")} />
      <span className={`col-span-full text-[11px] ${tone}`}>{t("wz.slowFrom", { pct: Math.round(p.taper_knee) })} · {p.kwh_per_km} kWh/km</span>
    </div>
  );
}
