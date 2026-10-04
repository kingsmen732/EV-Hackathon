"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BatteryLow, Crosshair, Flag, IndianRupee, Leaf, Loader2, MapPin, Navigation, Pencil, Scale, Search, Sparkles, Timer, Truck, X, Zap } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n, type Key } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import { usePoll } from "@/lib/usePoll";
import { mins } from "@/lib/format";
import type { Driver, MatchOption, MatchResult, Station, TripPlan, TripStop, User } from "@/lib/types";
import { useGeo } from "@/lib/useGeo";
import { explain, parseIntent } from "@/lib/edgeai/tasks";
import AskBox, { type AiRun, EngineBadge } from "@/components/driver/AskBox";
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
const DEMO_START = (() => { const [a, b] = (process.env.NEXT_PUBLIC_GPS_FALLBACK ?? "").split(",").map(Number); return a && b ? { lat: a, lon: b } : null; })();
const far = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => Math.hypot((a.lat - b.lat) * 111, (a.lon - b.lon) * 108) > 0.15; // km
type Place = { lat: number; lon: number; label: string };
const line = (a: { lat: number; lon: number }, b: { lat: number; lon: number }): [number, number][] => [[a.lat, a.lon], [b.lat, b.lon]];

export default function DrivePage() {
  const router = useRouter();
  const { user, loading, setUser } = useAuth();
  const { t, lang } = useI18n();
  const toast = useToast();
  const geo = useGeo();
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
  // trip planning
  const [mode, setMode] = useState<"near" | "trip">("near");
  const [dest, setDest] = useState<Place | null>(null);
  const [destQ, setDestQ] = useState("");
  const [destHits, setDestHits] = useState<Place[]>([]);
  const [pickDest, setPickDest] = useState(false);
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [stopSel, setStopSel] = useState(0);
  const [onward, setOnward] = useState<{ path: [number, number][]; dest: Place } | null>(null);
  // on-device AI
  const [ai, setAi] = useState<AiRun | null>(null);
  const [why, setWhy] = useState<{ id: string; text: string; run: AiRun } | null>(null);
  const [whyBusy, setWhyBusy] = useState(false);
  const [wantFocus, setWantFocus] = useState(false);

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

  /** Move the trip start to where the device is now (the driver may have moved since setup). */
  async function syncStart(id: string | null): Promise<string | null> {
    if (!id || !me || !gpsIn || !far(gpsIn, me)) return id;
    const d = await run(() => api<Driver>("/drive/start", { method: "POST", json: {
      soc: Math.max(1, Math.round(me.soc)), target_soc: me.target_soc, lat: gpsIn.lat, lon: gpsIn.lon } }));
    if (!d) return id;
    setVid(d.id); setMe(d);
    return d.id;
  }

  async function search(p = pref, f = flex, ps = pass, id = vid) {
    id = await syncStart(id);
    if (!id) return;
    const r = await run(() => api<MatchResult>("/match", { method: "POST", json: { vehicle_id: id, preference: p, flexible_min: f, priority_pass: ps } }));
    if (r) { setResult(r); setPlan(null); setWhy(null); setShowAll(false); setSelected(null); if (r.options[0]) setFocus([r.options[0].lat, r.options[0].lon]); }
  }

  async function planTrip(d = dest, p = pref, ps = pass, id = vid) {
    if (!d) return;
    id = await syncStart(id);
    if (!id) return;
    const r = await run(() => api<TripPlan>("/trip/plan", { method: "POST", json: {
      vehicle_id: id, dest_lat: d.lat, dest_lon: d.lon, dest_label: d.label.slice(0, 120), preference: p, priority_pass: ps } }));
    if (r) { setPlan(r); setResult(null); setWhy(null); setStopSel(0); setShowAll(false); setSelected(null); }
  }

  async function reserve(o: MatchOption) {
    const d = await run(() => api<Driver>("/reservations", { method: "POST", json: { vehicle_id: vid, quote_id: o.quote_id } }));
    if (!d) return;
    if (plan && dest && "leg2_path" in o) setOnward({ path: (o as TripStop).leg2_path, dest });
    setMe(d); setResult(null); setPlan(null); setHover(null); setWhy(null); toast(`${o.name} ✓`, "ok");
  }

  async function findPlace(q: string): Promise<Place | null> {
    try {
      const at = me ?? gpsIn ?? { lat: 13.05, lon: 80.22 };
      const r = await api<{ results: Place[] }>(`/geo/search?q=${encodeURIComponent(q)}&lat=${at.lat}&lon=${at.lon}`);
      if (r.results[0]) return r.results[0];
    } catch { /* fall through to the station list */ }
    const s = net?.stations.find((x) => `${x.area} ${x.name}`.toLowerCase().includes(q.toLowerCase()));
    return s ? { lat: s.lat, lon: s.lon, label: s.area } : null;
  }

  /** "Ask ChargeMesh": a local model turns the sentence into search settings, then we run the search. */
  async function ask(text: string) {
    if (!me || !vid) return;
    const places = [...new Set((net?.stations ?? []).map((s) => s.area))];
    const r = await parseIntent(text, places);
    const i = r.intent;
    const np = i.preference ?? pref, nf = i.flexible_min ?? flex, nps = i.priority_pass ?? pass;
    const chips = [i.destination && `→ ${i.destination}`, i.preference && t(`pref.${i.preference}` as Key),
      i.flexible_min != null && t(`flex.${i.flexible_min}` as Key), i.target_soc && `${t("setup.chargeTo")} ${i.target_soc}%`,
      i.priority_pass && t("find.pass")].filter(Boolean) as string[];
    setAi({ engine: r.engine, model: r.model, ms: r.ms, chips });
    setPref(np); setFlex(nf); setPass(nps);
    let id = vid;
    if (i.target_soc && Math.abs(i.target_soc - me.target_soc) >= 1) {
      const d = await run(() => api<Driver>("/drive/start", { method: "POST", json: {
        soc: Math.max(1, Math.round(me.soc)), target_soc: i.target_soc, lat: me.lat, lon: me.lon } }));
      if (d) { id = d.id; setVid(d.id); setMe(d); }
    }
    if (i.destination) {
      const hit = await findPlace(i.destination);
      if (!hit) { toast(t("ask.notFound", { q: i.destination }), "error"); return; }
      setMode("trip"); setDest(hit); setDestQ("");
      await planTrip(hit, np, nps, id);
    } else { setMode("near"); await search(np, nf, nps, id); }
  }

  async function explainPick(o: MatchOption) {
    setWhyBusy(true);
    try {
      const stop = o as Partial<TripStop>;
      const r = await explain({
        station: `${o.name}, ${o.area}`, drive_min: Math.round(o.travel_min), wait_min: Math.round(o.wait_min),
        charge_min: Math.round(o.charge_min), power_kw: Math.round(o.delivered_kw), price_per_kwh: o.price_per_kwh,
        est_cost_inr: Math.round(o.est_cost), priority: pref, reasons: o.reasons,
        ...(stop.detour_min != null ? { destination: dest?.label, detour_min: Math.round(stop.detour_min), battery_at_destination_pct: Math.round(stop.dest_arrive_soc ?? 0) } : {}),
      }, lang);
      setWhy({ id: o.quote_id, text: r.text.trim(), run: { engine: r.engine, model: r.model, ms: r.ms } });
    } catch { toast(t("ask.noModel"), "error"); }
    finally { setWhyBusy(false); }
  }

  // destination search box
  useEffect(() => {
    if (destQ.trim().length < 3) { setDestHits([]); return; }
    const h = setTimeout(async () => {
      const at = me ?? gpsIn ?? { lat: 13.05, lon: 80.22 };
      let hits: Place[] = [];
      try { hits = (await api<{ results: Place[] }>(`/geo/search?q=${encodeURIComponent(destQ)}&lat=${at.lat}&lon=${at.lon}`)).results; } catch { /* offline: local only */ }
      const local = (net?.stations ?? []).filter((s) => s.kind === "public" && `${s.area} ${s.name}`.toLowerCase().includes(destQ.toLowerCase()))
        .map((s) => ({ label: s.area, lat: s.lat + 0.004, lon: s.lon - 0.004 }));
      setDestHits([...hits, ...local].slice(0, 7));
    }, 300);
    return () => clearTimeout(h);
  }, [destQ]); // eslint-disable-line react-hooks/exhaustive-deps

  // live GPS
  // The start is always the device's location. NEXT_PUBLIC_GPS_FALLBACK="lat,lon" is a demo-only
  // stand-in used when the device is outside the service area or has no location.
  const live = geo.fix && geo.inArea ? { lat: geo.fix.lat, lon: geo.fix.lon } : null;
  const demoStart = !live && DEMO_START && ["on", "denied", "unavailable", "insecure"].includes(geo.status);
  const gpsIn = live ?? (demoStart ? DEMO_START : null);
  const [centred, setCentred] = useState(false);
  useEffect(() => { if (!centred && gpsIn) { setFocus([gpsIn.lat, gpsIn.lon]); setCentred(true); } }, [centred, gpsIn?.lat]); // eslint-disable-line react-hooks/exhaustive-deps
  function locate() { geo.start(); if (geo.fix) setFocus([geo.fix.lat, geo.fix.lon]); else setWantFocus(true); }
  useEffect(() => {
    if (wantFocus && geo.fix) { setFocus([geo.fix.lat, geo.fix.lon]); setWantFocus(false); }
    if (wantFocus && ["denied", "unavailable", "insecure"].includes(geo.status)) {
      setWantFocus(false);
      toast(t(geo.status === "denied" ? "setup.denied" : geo.status === "insecure" ? "gps.insecure" : "setup.noGps"), "error");
    }
  }, [wantFocus, geo.fix, geo.status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(path: string, method = "POST", json?: unknown) {
    const d = await run(() => api<Driver>(path, { method, json }));
    if (d) setMe(d);
  }

  const mePos = editing || !me ? picked ?? (me ? { lat: me.lat, lon: me.lon } : null) : { lat: me.lat, lon: me.lon };
  const compatible = useMemo(() => {
    if (!net || !gv) return null;
    const conns = new Set(gv.connectors);
    const at = me ?? gpsIn;   // only count stations around the driver, not the whole country
    return new Set(net.stations.filter((st) => (!at || Math.hypot((st.lat - at.lat) * 111, (st.lon - at.lon) * 100) < 60) && st.chargers.some((c) => conns.has(c.connector) &&
      (DC.has(c.connector) ? gv.max_dc_kw > 0 || c.connector === "LECCS" : gv.max_ac_kw > 0))).map((st) => st.id));
  }, [net, gv, me?.lat, me?.lon, gpsIn?.lat, gpsIn?.lon]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (onward && me && !trip) setOnward(null); }, [onward, me, trip]);

  const stops = plan?.stops ?? [];
  const stop = stops.length ? stops[Math.min(stopSel, stops.length - 1)] : null;
  const showStops = !!plan && stops.length > 0 && (plan.needs_charge || showAll);
  const tripKey = trip ? `${trip.id}:${trip.status === "scheduled" || trip.status === "en_route"}` : "";
  const legs = useMemo(() => {
    if (trip && me) {
      const driving = trip.status === "scheduled" || trip.status === "en_route";
      return [
        ...(driving ? [{ path: trip.path?.length ? trip.path : line(me, trip), color: "#1fd084" }] : []),
        ...(onward ? [{ path: onward.path, color: "#38bdf8", dashed: true }] : []),
      ];
    }
    if (plan) {
      if (showStops && stop) return [{ path: stop.leg1_path, color: "#1fd084" }, { path: stop.leg2_path, color: "#38bdf8", dashed: true }];
      return [{ path: plan.direct.path, color: plan.needs_charge ? "#f04d4d" : "#1fd084", dashed: plan.needs_charge }];
    }
    const o = hover ?? result?.options[0];
    if (o && me) return [{ path: line(me, o), color: hover ? "#38bdf8" : "#1fd084" }];
    return [];
  }, [tripKey, onward, plan, stop, showStops, hover, result, trip ? null : me?.lat, trip ? null : me?.lon]); // eslint-disable-line react-hooks/exhaustive-deps
  const destPin = trip ? onward?.dest ?? null : mode === "trip" ? dest : null;

  const lowBattery = me && me.soc < 15 && !trip && !me.rescue;
  const opts = result?.options ?? [];
  const visible = showAll ? opts : opts.slice(0, 1);
  const saved = result?.nearest && opts[0] && result.nearest.station_id !== opts[0].station_id
    ? Math.max(0, result.nearest.total_min - opts[0].total_min) : 0;

  return (
    <div className="md:flex md:h-[calc(100dvh-56px)]">
      {/* MAP */}
      <section className="relative h-[44dvh] md:h-full md:flex-1" aria-label="Map">
        <MapView stations={net?.stations ?? []} units={net?.units ?? []} me={mePos} meIsCar={!!trip} legs={legs} fit={!!plan} dest={destPin}
          gps={geo.fix} onLocate={locate} locating={geo.status === "locating"} located={geo.status === "on"} compatible={compatible}
          highlight={(showStops ? stops : opts).map((o) => o.station_id).concat(trip ? [trip.station_id] : [])}
          selected={selected} onSelect={setSelected} picking={pickDest}
          onPick={(lat, lon) => {
            if (pickDest) { setDest({ lat, lon, label: t("setup.pinned") }); setPickDest(false); setPlan(null); }
            else { setPicked({ lat, lon }); setPicking(false); }
          }} focus={focus} />
        {geo.status === "on" && geo.inArea === false && (
          <div className="pointer-events-none absolute inset-x-3 bottom-20 z-[500] mx-auto max-w-sm rounded-xl border border-amp-500/40 bg-ink-900/95 px-3 py-2 text-center text-xs text-amp-400 shadow-lg md:bottom-16">{t("setup.outside")}</div>
        )}
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
              <DriverSetup vehicle={gv!} vehicles={user!.vehicles} onSwitch={switchVehicle} 
                gpsLoc={gpsIn} onLocate={geo.start} geoStatus={geo.status} demo={!!demoStart} onSubmit={startDrive}
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

            {!trip && !me.rescue && <AskBox onAsk={ask} last={ai} disabled={busy} />}

            {!trip && !me.rescue && !result && !plan && (
              <section className="card space-y-4 p-4">
                <div className="seg">
                  <button type="button" aria-pressed={mode === "near"} onClick={() => { setMode("near"); setPickDest(false); }}><Zap size={13} className="mr-1 inline" />{t("mode.near")}</button>
                  <button type="button" aria-pressed={mode === "trip"} onClick={() => setMode("trip")}><Navigation size={13} className="mr-1 inline" />{t("mode.trip")}</button>
                </div>
                {mode === "trip" && (
                  <div>
                    <div className="mb-2 text-sm font-medium">{t("trip.to")}</div>
                    <div className="mb-2 flex items-center gap-1.5 text-xs text-slate-400"><MapPin size={12} className="text-sky-400" />{t("trip.from")}</div>
                    <div className="relative flex gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-ink-700 bg-ink-850 px-3 focus-within:border-volt-500/70">
                        <Flag size={16} className="shrink-0 text-surge-400" />
                        {dest && !destQ ? (
                          <button type="button" className="flex w-full items-center justify-between gap-2 py-2.5 text-left text-sm" onClick={() => { setDest(null); setPlan(null); }}>
                            <span className="truncate">{dest.label}</span><X size={14} className="shrink-0 text-slate-500" />
                          </button>
                        ) : (
                          <input value={destQ} onChange={(e) => setDestQ(e.target.value)} placeholder={t("trip.search")} aria-label={t("trip.search")}
                            className="w-full bg-transparent py-2.5 text-sm outline-none" />
                        )}
                      </div>
                      <button type="button" className={pickDest ? "btn-primary !px-3" : "btn-ghost !px-3"} aria-pressed={pickDest}
                        onClick={() => setPickDest(!pickDest)} title={t("trip.pin")} aria-label={t("trip.pin")}><Crosshair size={17} /></button>
                      {destHits.length > 0 && (
                        <ul role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">
                          {destHits.map((h, i) => (
                            <li key={i}><button type="button" className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm hover:bg-ink-800"
                              onClick={() => { setDest(h); setDestQ(""); setDestHits([]); setFocus([h.lat, h.lon]); }}>
                              <MapPin size={14} className="mt-0.5 shrink-0 text-slate-500" />{h.label}</button></li>
                          ))}
                        </ul>
                      )}
                    </div>
                    {pickDest && <p className="mt-1.5 text-xs text-volt-400">{t("trip.pin")}</p>}
                  </div>
                )}
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
                <div className={mode === "trip" ? "hidden" : ""}>
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
                {mode === "trip" ? (
                  <button className="btn-primary w-full !py-3 text-base" disabled={busy || !dest} onClick={() => planTrip()}>
                    {busy ? <><Loader2 size={18} className="animate-spin" />{t("trip.planning")}</> : <><Navigation size={18} />{t("trip.plan")}</>}
                  </button>
                ) : (
                  <button className="btn-primary w-full !py-3 text-base" disabled={busy} onClick={() => search()}>
                    {busy ? <><Loader2 size={18} className="animate-spin" />{t("find.searching")}</> : <><Search size={18} />{t("find.cta")}</>}
                  </button>
                )}
              </section>
            )}

            {plan && !trip && (
              <section className="space-y-3" aria-live="polite">
                <div className="card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="label">{t("mode.trip")}</div>
                      <div className="flex items-center gap-1.5 truncate font-semibold"><Flag size={15} className="shrink-0 text-surge-400" /><span className="truncate">{plan.dest.label ?? dest?.label}</span></div>
                      <div className="mt-0.5 text-xs text-slate-400">{t("trip.direct", { km: plan.direct.km, min: mins(plan.direct.min) })}{plan.direct.reachable && <> · {t("trip.arrive", { pct: Math.round(plan.direct.arrive_soc) })}</>}</div>
                    </div>
                    <button className="shrink-0 text-xs font-medium text-volt-400 hover:underline" onClick={() => { setPlan(null); setWhy(null); }}>{t("res.newSearch")}</button>
                  </div>
                  <div className={`mt-3 rounded-xl border px-3 py-2 text-xs ${plan.needs_charge ? "border-amp-500/40 bg-amp-500/5 text-amp-400" : "border-volt-500/30 bg-volt-500/5 text-volt-300"}`}>
                    {!plan.needs_charge ? t("trip.noCharge") : stops[0]?.more_stops ? t("trip.needMany") : t("trip.needCharge")}
                  </div>
                  {plan.routing === "ola-live" && <span className="chip mt-2 bg-volt-500/15 text-volt-300">{t("res.live")}</span>}
                </div>
                {plan.needs_charge && stops.length === 0 && (
                  <div className="card p-4 text-sm">{t("trip.noStops")}
                    <button className="btn-primary mt-3 w-full" onClick={() => act("/rescue", "POST", { vehicle_id: me.id })}><Truck size={16} />{t("rescue.cta", { c: 249, k: 22 })}</button>
                  </div>
                )}
                {!plan.needs_charge && stops.length > 0 && (
                  <button className="btn-ghost w-full" onClick={() => setShowAll(!showAll)}>{showAll ? t("res.less") : t("trip.optional")}</button>
                )}
                {showStops && stops.map((o, i) => (
                  <div key={o.quote_id} onClick={() => setStopSel(i)} className={`rounded-2xl transition ${stop === o ? "ring-1 ring-sky-400/60" : "opacity-90"}`}>
                    <OptionCard o={o} primary={i === 0} busy={busy} onReserve={() => reserve(o)} onHover={(on) => on && setStopSel(i)} />
                    <div className="-mt-2 rounded-b-2xl border border-t-0 border-ink-700 bg-ink-900 px-4 pb-3 pt-4 text-xs text-slate-300">
                      <div className="flex items-center gap-1.5"><Navigation size={12} className="text-sky-400" />{t("trip.onward", { place: plan.dest.label ?? dest?.label ?? "" })} · {o.leg2_km} km · {mins(o.leg2_min)}</div>
                      {o.more_stops ? <div className="mt-1 text-amp-400">{t("trip.multi", { n: o.more_stops + 1 })}</div>
                        : <div className="mt-1 text-slate-400">{t("trip.stopHint", { min: mins(Math.max(0, o.detour_min)), pct: Math.round(o.dest_arrive_soc) })} · {t("trip.total", { min: mins(o.trip_min) })}</div>}
                      {i === 0 && <WhyBox o={o} why={why} busy={whyBusy} onAsk={() => explainPick(o)} label={t("ask.why")} />}
                    </div>
                  </div>
                ))}
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
                  <div key={o.quote_id}>
                    <OptionCard o={o} primary={i === 0} busy={busy} onReserve={() => reserve(o)} onHover={(on) => setHover(on ? o : null)} />
                    {i === 0 && <div className="px-1 pt-1.5"><WhyBox o={o} why={why} busy={whyBusy} onAsk={() => explainPick(o)} label={t("ask.why")} /></div>}
                  </div>
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

function WhyBox({ o, why, busy, onAsk, label }: { o: MatchOption; why: { id: string; text: string; run: AiRun } | null; busy: boolean; onAsk: () => void; label: string }) {
  if (why?.id === o.quote_id) return (
    <div className="mt-2 rounded-xl border border-sky-400/30 bg-sky-500/5 px-3 py-2 text-xs leading-relaxed text-slate-200">
      {why.text}<div className="mt-1.5"><EngineBadge run={why.run} /></div>
    </div>
  );
  return (
    <button type="button" className="mt-1.5 flex items-center gap-1 text-xs font-medium text-sky-400 hover:underline" disabled={busy}
      onClick={(e) => { e.stopPropagation(); onAsk(); }}>
      {busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}{label}
    </button>
  );
}
