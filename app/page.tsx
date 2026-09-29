"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BatteryLow, IndianRupee, Leaf, Loader2, Pencil, Scale, Search, Sparkles, Timer, Truck, Zap } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n, type Key } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import { usePoll } from "@/lib/usePoll";
import { mins } from "@/lib/format";
import type { Driver, MatchOption, MatchResult, Station, User } from "@/lib/types";
import DriverSetup, { type DriveValue } from "@/components/driver/DriverSetup";
import OptionCard from "@/components/driver/OptionCard";
import TripCard, { SocBar } from "@/components/driver/TripCard";
import StationSheet from "@/components/driver/StationSheet";
import MapView from "@/components/MapView";

interface PublicState { stations: Station[]; units: { id: string; lat: number; lon: number; status: string }[] }

const DC = new Set(["CCS2", "GBT", "LECCS"]);
const PREFS: { id: string; k: Key; icon: React.ElementType }[] = [
  { id: "balanced", k: "pref.balanced", icon: Scale },
  { id: "fastest", k: "pref.fastest", icon: Zap },
  { id: "cheapest", k: "pref.cheapest", icon: IndianRupee },
  { id: "greenest", k: "pref.greenest", icon: Leaf },
];
const FLEX = [0, 30, 60, 120, 180];
const ACTIVE = ["scheduled", "en_route", "queued", "charging"];

export default function DrivePage() {
  const router = useRouter();
  const { user, loading, setUser } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const [vid, setVid] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<{ lat: number; lon: number } | null>(null);
  const [pref, setPref] = useState("balanced");
  const [flex, setFlex] = useState(0);
  const [pass, setPass] = useState(false);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [hover, setHover] = useState<MatchOption | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<[number, number] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (user.vehicles.length === 0) router.replace("/onboarding");
    else setVid(user.drive_id ?? null);
  }, [loading, user, router]);

  const gv = user?.vehicles.find((g) => g.id === user.active_vehicle) ?? user?.vehicles[0] ?? null;
  const ready = !loading && !!user && !!gv;

  const { data: net, error: netErr } = usePoll<PublicState>("/state", 5000);
  const { data: me, error: meErr, setData: setMe } = usePoll<Driver>(vid ? `/drivers/${vid}` : null, 2000);

  useEffect(() => {
    if (meErr && /No active drive/.test(meErr)) { setVid(null); setMe(null); }
  }, [meErr, setMe]);

  const trip = me?.reservation && ACTIVE.includes(me.reservation.status) ? me.reservation : null;
  const showTrip = !!(me && (trip || me.rescue || me.reservation?.status === "completed"));

  const run = useCallback(async <T,>(fn: () => Promise<T>) => {
    setBusy(true);
    try { return await fn(); }
    catch (e) { toast(e instanceof ApiError || e instanceof Error ? e.message : t("err.generic"), "error"); }
    finally { setBusy(false); }
  }, [toast, t]);

  async function startDrive(v: DriveValue) {
    await run(async () => {
      const d = await api<Driver>("/drive/start", { method: "POST", json: v });
      setVid(d.id); setMe(d); setEditing(false); setPicking(false); setResult(null);
      setFocus([d.lat, d.lon]);
    });
  }

  async function switchVehicle(gid: string) {
    const u = await run(() => api<User>(`/me/vehicles/${gid}/activate`, { method: "POST" }));
    if (u) { setUser(u); setVid(null); setMe(null); setResult(null); setEditing(true); }
  }

  async function search() {
    if (!vid) return;
    const r = await run(() => api<MatchResult>("/match", { method: "POST", json: { vehicle_id: vid, preference: pref, flexible_min: flex, priority_pass: pass } }));
    if (r) { setResult(r); setShowAll(false); setSelected(null); if (r.options[0]) setFocus([r.options[0].lat, r.options[0].lon]); }
  }

  async function reserve(o: MatchOption) {
    const d = await run(() => api<Driver>("/reservations", { method: "POST", json: { vehicle_id: vid, quote_id: o.quote_id } }));
    if (d) { setMe(d); setResult(null); setHover(null); toast(`${o.name} ✓`, "ok"); }
  }

  async function act(path: string, method = "POST", json?: unknown) {
    const d = await run(() => api<Driver>(path, { method, json }));
    if (d) setMe(d);
  }

  const mePos = editing || !me ? picked ?? (me ? { lat: me.lat, lon: me.lon } : null) : { lat: me.lat, lon: me.lon };
  const compatible = useMemo(() => {
    if (!net || !gv) return null;
    const conns = new Set(gv.connectors);
    return new Set(net.stations.filter((st) => st.chargers.some((c) => conns.has(c.connector) &&
      (DC.has(c.connector) ? gv.max_dc_kw > 0 || c.connector === "LECCS" : gv.max_ac_kw > 0))).map((st) => st.id));
  }, [net, gv]);
  const route = useMemo(() => {
    if (trip && me) return { from: [me.lat, me.lon] as [number, number], to: [trip.lat, trip.lon] as [number, number] };
    const o = hover ?? result?.options[0];
    if (o && me) return { from: [me.lat, me.lon] as [number, number], to: [o.lat, o.lon] as [number, number], color: hover ? "#38bdf8" : "#1fd084" };
    return null;
  }, [trip, me, hover, result]);

  const lowBattery = me && me.soc < 15 && !trip && !me.rescue;
  const opts = result?.options ?? [];
  const visible = showAll ? opts : opts.slice(0, 1);
  const saved = result?.nearest && opts[0] && result.nearest.station_id !== opts[0].station_id
    ? Math.max(0, result.nearest.total_min - opts[0].total_min) : 0;

  return (
    <div className="md:flex md:h-[calc(100dvh-56px)]">
      {/* MAP */}
      <section className="relative h-[44dvh] md:h-full md:flex-1" aria-label="Map">
        <MapView stations={net?.stations ?? []} units={net?.units ?? []} me={mePos} route={route}
          routePath={trip?.path ?? null} compatible={compatible}
          highlight={opts.map((o) => o.station_id).concat(trip ? [trip.station_id] : [])}
          selected={selected} onSelect={setSelected} picking={picking}
          onPick={(lat, lon) => { setPicked({ lat, lon }); setPicking(false); }} focus={focus} />
        {compatible && net && (
          <div className="pointer-events-none absolute left-3 top-3 z-[500] max-w-[calc(100%-7.5rem)] truncate rounded-xl border border-ink-700 bg-ink-900/90 px-3 py-2 text-xs shadow-lg backdrop-blur">
            <Zap size={12} className="mr-1 inline text-volt-400" />{t("map.compatible", { n: compatible.size })}
          </div>
        )}
        <div className="pointer-events-none absolute bottom-6 left-3 z-[500] hidden flex-wrap gap-x-3 sm:flex md:bottom-3 gap-y-1 rounded-xl border border-ink-700 bg-ink-900/90 px-3 py-1.5 text-[10px] text-slate-300 backdrop-blur">
          <Legend c="#1fd084" l={t("legend.short")} /><Legend c="#f5a524" l={t("legend.some")} /><Legend c="#f04d4d" l={t("legend.long")} />
          <Legend c="#9a7bff" l={t("legend.shared")} sq /><Legend c="#334155" l={t("legend.nofit")} />
        </div>
      </section>

      {/* PANEL */}
      <aside className="relative z-10 -mt-4 space-y-3 rounded-t-3xl bg-ink-950 p-3 pt-5 no-scrollbar md:mt-0 md:h-full md:w-[440px] md:overflow-y-auto md:rounded-none md:border-l md:border-ink-700 md:pt-3">
        <div className="mx-auto -mt-2 mb-1 h-1 w-10 rounded-full bg-ink-700 md:hidden" aria-hidden />
        {netErr && <div className="card p-3 text-xs text-amp-400">{t("err.network")}</div>}

        {!ready ? (
          <div className="card space-y-3 p-4"><div className="skeleton h-5 w-1/2" /><div className="skeleton h-14" /><div className="skeleton h-10" /></div>
        ) : (!vid || !me || editing) ? (
          !vid || editing ? (
            <section className="card p-4">
              <h1 className="mb-1 text-lg font-semibold">{editing ? t("drive.update") : t("drive.hello", { name: user!.name.split(" ")[0] })}</h1>
              {!editing && <p className="mb-4 text-sm text-slate-400">{t("drive.intro")}</p>}
              <DriverSetup vehicle={gv!} vehicles={user!.vehicles} onSwitch={switchVehicle} stations={net?.stations ?? []}
                pickedLoc={picked} picking={picking} onTogglePick={() => setPicking(!picking)} onSubmit={startDrive}
                busy={busy} lockTrip={!!trip} initial={me ? { soc: me.soc, target_soc: me.target_soc, lat: me.lat, lon: me.lon } : null}
                onCancel={editing && me ? () => { setEditing(false); setPicking(false); } : undefined} />
            </section>
          ) : <div className="card space-y-3 p-4"><div className="skeleton h-5 w-1/2" /><div className="skeleton h-10" /></div>
        ) : (
          <>
            <section className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="label">{t("ev.label")}</div>
                  <div className="truncate font-semibold">{gv!.nickname || me.model} <span className="text-xs font-normal text-slate-400">{me.year}</span></div>
                  <div className="text-xs text-slate-400">{t("ev.health", { soh: Math.round(me.soh) })} · {me.max_dc_kw ? `${Math.round(me.max_dc_kw)} kW DC` : t("ev.acOnly")} · {t("setup.range", { km: Math.round(me.range_km) })}</div>
                </div>
                {!trip && <button className="btn-ghost !px-2.5 !py-1.5 text-xs" onClick={() => { setPicked(null); setEditing(true); }}><Pencil size={13} />{t("common.edit")}</button>}
              </div>
              <SocBar soc={me.soc} target={me.target_soc} />
            </section>

            {showTrip && (
              <TripCard d={me} busy={busy}
                onCancel={() => me.reservation && act(`/reservations/${me.reservation.id}/cancel?vehicle_id=${me.id}`)}
                onStop={() => act(`/drivers/${me.id}/stop`)}
                onDone={() => { setEditing(true); setPicked(null); }} />
            )}

            {lowBattery && (
              <section className="card border-surge-500/40 p-4">
                <h2 className="flex items-center gap-2 font-semibold text-surge-400"><BatteryLow size={18} />{t("rescue.low", { pct: Math.round(me.soc) })}</h2>
                <p className="mt-1 text-sm text-slate-400">{t("rescue.lowHint")}</p>
                <button className="btn-ghost mt-3 w-full" disabled={busy} onClick={() => act("/rescue", "POST", { vehicle_id: me.id })}>
                  <Truck size={16} />{t("rescue.cta", { c: 249, k: 22 })}
                </button>
              </section>
            )}

            {!trip && !me.rescue && !result && (
              <section className="card space-y-4 p-4">
                <div>
                  <div className="mb-2 text-sm font-medium">{t("find.optimise")}</div>
                  <div className="grid grid-cols-4 gap-2">
                    {PREFS.map(({ id, k, icon: I }) => (
                      <button key={id} type="button" aria-pressed={pref === id} onClick={() => setPref(id)}
                        className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2.5 text-[11px] font-medium transition ${pref === id ? "border-volt-500 bg-volt-500/10 text-white" : "border-ink-700 bg-ink-850 text-slate-400 hover:border-ink-600"}`}>
                        <I size={18} className={pref === id ? "text-volt-400" : ""} />{t(k)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex items-center gap-1.5 text-sm font-medium"><Timer size={14} className="text-slate-400" />{t("find.leave")}</div>
                  <div className="seg">{FLEX.map((f) => <button key={f} type="button" aria-pressed={flex === f} onClick={() => setFlex(f)}>{t(`flex.${f}` as Key)}</button>)}</div>
                  <p className="mt-1.5 text-xs text-slate-500">{t("find.flexHint")}</p>
                </div>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-ink-700 bg-ink-850 px-3 py-3">
                  <Sparkles size={18} className="shrink-0 text-amp-400" />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-medium">{t("find.pass")}</span>
                    <span className="block text-xs text-slate-400">{t("find.passHint")}</span>
                  </span>
                  <input type="checkbox" checked={pass} onChange={(e) => setPass(e.target.checked)} className="h-5 w-5 accent-amp-500" />
                </label>
                <button className="btn-primary w-full !py-3 text-base" disabled={busy} onClick={search}>
                  {busy ? <><Loader2 size={18} className="animate-spin" />{t("find.searching")}</> : <><Search size={18} />{t("find.cta")}</>}
                </button>
              </section>
            )}

            {result && !trip && (
              <section className="space-y-3" aria-live="polite">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5 text-[11px]">
                    {result.routing === "ola-live" && <span className="chip bg-volt-500/15 text-volt-300">{t("res.live")}</span>}
                    {pass && <span className="chip bg-amp-500/15 text-amp-400"><Sparkles size={11} />{t("find.pass")} · ₹{result.priority_pass_price}</span>}
                  </div>
                  <button className="text-xs font-medium text-volt-400 hover:underline" onClick={() => { setResult(null); setHover(null); }}>{t("res.newSearch")}</button>
                </div>
                {saved >= 3 && result.nearest && (
                  <div className="rounded-xl border border-volt-500/30 bg-volt-500/5 px-3 py-2 text-xs text-volt-300">
                    {t("res.saves", { m: mins(saved), area: result.nearest.area })}
                  </div>
                )}
                {result.critical && <div className="rounded-xl border border-surge-500/40 bg-surge-500/5 px-3 py-2 text-xs text-surge-400">{t("res.critical")}</div>}
                {opts.length === 0 && (
                  <div className="card p-4 text-sm">
                    {t("res.none", { pct: Math.round(me.soc), km: result.range_km })}
                    <button className="btn-primary mt-3 w-full" onClick={() => act("/rescue", "POST", { vehicle_id: me.id })}><Truck size={16} />{t("rescue.cta", { c: 249, k: 22 })}</button>
                  </div>
                )}
                {visible.map((o, i) => (
                  <OptionCard key={o.quote_id} o={o} primary={i === 0} busy={busy} onReserve={() => reserve(o)}
                    onHover={(on) => setHover(on ? o : null)} />
                ))}
                {opts.length > 1 && (
                  <button className="btn-ghost w-full" onClick={() => setShowAll(!showAll)}>
                    {showAll ? t("res.less") : t("res.more", { n: opts.length - 1 })}
                  </button>
                )}
              </section>
            )}
          </>
        )}

        {selected && <StationSheet id={selected} vehicle={gv} onClose={() => setSelected(null)} />}
      </aside>
    </div>
  );
}

function Legend({ c, l, sq }: { c: string; l: string; sq?: boolean }) {
  return <span className="flex items-center gap-1"><i className={`inline-block h-2.5 w-2.5 ${sq ? "rounded-sm" : "rounded-full"}`} style={{ background: c }} />{l}</span>;
}
