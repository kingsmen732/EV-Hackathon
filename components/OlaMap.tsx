"use client";
/* Ola Maps (Krutrim) vector map via olamaps-web-sdk (MapLibre GL under the hood). */
import { useEffect, useRef, useState } from "react";
import { CAR_HTML, CENTER, DEST_HTML, GPS_HTML, ME_HTML, type MapProps, circleRing, stationHtml, stationTitle, unitHtml } from "@/lib/mapIcons";

const KEY = process.env.NEXT_PUBLIC_OLA_MAPS_API_KEY ?? "";

type Mk = { m: any; el: HTMLDivElement; key: string };
const EMPTY = { type: "FeatureCollection", features: [] };

/** Rewrite label layers to prefer `name:<lang>` (Ola's regional styles only localise major roads). */
function localizeLabels(m: any, lang: string) {
  if (!lang || lang === "en") return;
  const key = `name:${lang}`;
  // prefer the localized name when present and non-empty, else the default name
  const loc = ["case", ["all", ["has", key], ["!=", ["to-string", ["get", key]], ""]], ["get", key], ["coalesce", ["get", "name"], ""]];
  const swap = (e: any): any => {
    if (Array.isArray(e)) {
      if (e.length === 2 && e[0] === "get" && e[1] === "name") return loc;
      return e.map(swap);
    }
    return e;
  };
  for (const layer of m.getStyle()?.layers ?? []) {
    if (layer.type !== "symbol") continue;
    const tf = layer.layout?.["text-field"];
    if (tf == null) continue;
    let next: any = null;
    if (typeof tf === "string") next = tf === "{name}" ? loc : null;
    else if (tf && typeof tf === "object" && !Array.isArray(tf) && tf.property === "name") next = loc;
    else if (Array.isArray(tf)) { const sw = swap(tf); if (JSON.stringify(sw) !== JSON.stringify(tf)) next = sw; }
    if (next) { try { m.setLayoutProperty(layer.id, "text-field", next); } catch { /* ignore */ } }
  }
}

export default function OlaMap(p: MapProps & { styleUrl: string; lang?: string; onFail?: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const ola = useRef<any>(null);
  const marks = useRef(new Map<string, Mk>());
  const props = useRef(p);
  props.current = p;
  const readyRef = useRef(false);
  const styleRef = useRef(p.styleUrl);
  const [ready, setReady] = useState(false);
  const [styleGen, setStyleGen] = useState(0); // bumps after every style (re)load

  // init once
  useEffect(() => {
    let dead = false;
    let failTimer: ReturnType<typeof setTimeout>;
    const armFail = () => {
      failTimer = setTimeout(() => {
        if (map.current?.loaded?.() || readyRef.current) return;
        if (document.hidden) return armFail(); // rendering pauses in hidden tabs — keep waiting
        props.current.onFail?.();
      }, 15000);
    };
    armFail();
    const ro = new ResizeObserver(() => map.current?.resize());
    if (box.current) ro.observe(box.current);

    (async () => {
      const { OlaMaps } = await import("olamaps-web-sdk");
      if (dead || !box.current) return;
      ola.current = new OlaMaps({ apiKey: KEY });
      const m = await ola.current.init({
        style: styleRef.current, container: box.current,
        center: [CENTER[1], CENTER[0]], zoom: 11.4, attributionControl: true,
      });
      if (dead) { m.remove(); return; }
      map.current = m;
      const addLayers = () => {
        localizeLabels(m, props.current.lang ?? "en");
        if (!m.getSource("route")) {
          m.addSource("gps-acc", { type: "geojson", data: EMPTY });
          m.addLayer({ id: "gps-acc", type: "fill", source: "gps-acc",
            paint: { "fill-color": "#38bdf8", "fill-opacity": 0.14, "fill-outline-color": "#38bdf8" } });
          m.addSource("route", { type: "geojson", data: EMPTY });
          const lay = { "line-cap": "round", "line-join": "round" };
          m.addLayer({ id: "route-casing", type: "line", source: "route", layout: lay,
            paint: { "line-color": "#070b10", "line-width": 8, "line-opacity": 0.55 } });
          m.addLayer({ id: "route", type: "line", source: "route", layout: lay, filter: ["!=", ["get", "dashed"], true],
            paint: { "line-color": ["coalesce", ["get", "color"], "#1fd084"], "line-width": 4.5 } });
          m.addLayer({ id: "route-dashed", type: "line", source: "route", layout: lay, filter: ["==", ["get", "dashed"], true],
            paint: { "line-color": ["coalesce", ["get", "color"], "#1fd084"], "line-width": 4, "line-dasharray": [1.6, 1.6] } });
        }
        setStyleGen((g) => g + 1);
      };
      const onLoad = () => {
        if (readyRef.current) return;
        clearTimeout(failTimer);
        readyRef.current = true;
        if (!m.getSource("route")) addLayers();
        setReady(true);
      };
      m.on("style.load", () => { addLayers(); onLoad(); }); // style.load fires even in hidden tabs
      m.on("load", onLoad);
      // init() can resolve after the first load (cached style) — don't miss it
      if (m.loaded?.() || m.isStyleLoaded?.()) onLoad();
      else m.once("idle", onLoad);
      m.on("click", (e: any) => {
        const q = props.current;
        if (q.picking && q.onPick) q.onPick(e.lngLat.lat, e.lngLat.lng);
      });
      m.on("error", (e: any) => {
        const msg = String(e?.error?.message ?? "");
        if (/401|403|Unauthorized|Forbidden/i.test(msg) && !readyRef.current) props.current.onFail?.();
      });
      try { ola.current.addNavigationControls?.({ showCompass: false, showZoom: true }); } catch {}
    })().catch(() => props.current.onFail?.());

    return () => {
      dead = true;
      clearTimeout(failTimer);
      ro.disconnect();
      marks.current.forEach((x) => x.m.remove());
      marks.current.clear();
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // switch label language / theme without re-creating the map
  useEffect(() => {
    if (!ready || !map.current || styleRef.current === p.styleUrl) return;
    styleRef.current = p.styleUrl;
    map.current.setStyle(p.styleUrl);
  }, [ready, p.styleUrl]);

  // marker reconciliation (DOM markers survive style changes)
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !ola.current) return;
    const seen = new Set<string>();
    const hl = new Set(p.highlight ?? []);
    const put = (id: string, lat: number, lon: number, html: string, title: string, key: string, onClick?: () => void, z = 0) => {
      seen.add(id);
      let mk = marks.current.get(id);
      if (!mk) {
        const el = document.createElement("div");
        el.style.zIndex = String(z);
        if (onClick) {
          el.setAttribute("role", "button");
          el.tabIndex = 0;
          el.addEventListener("click", (ev) => { ev.stopPropagation(); onClick(); });
          el.addEventListener("keydown", (ev) => { if (ev.key === "Enter") onClick(); });
        }
        const marker = ola.current.addMarker({ element: el, anchor: "center" }).setLngLat([lon, lat]).addTo(m);
        mk = { m: marker, el, key: "" };
        marks.current.set(id, mk);
      } else {
        mk.m.setLngLat([lon, lat]);
      }
      if (mk.key !== key) { mk.el.innerHTML = html; mk.el.title = title; mk.el.ariaLabel = title; mk.key = key; }
    };
    for (const s of p.stations) {
      const usable = !p.compatible || p.compatible.has(s.id);
      const { html } = stationHtml(s, hl.has(s.id), p.selected === s.id, usable);
      const title = stationTitle(s, usable);
      put(`s:${s.id}`, s.lat, s.lon, html, title, html + title, () => props.current.onSelect?.(s.id), 1);
    }
    for (const u of p.units ?? []) {
      const busy = u.status !== "idle";
      put(`u:${u.id}`, u.lat, u.lon, unitHtml(busy), "Mobile charging van", String(busy), undefined, 2);
    }
    if (p.dest) put("dest", p.dest.lat, p.dest.lon, DEST_HTML, p.dest.label || "Destination", "dest", undefined, 2);
    if (p.me) put("me", p.me.lat, p.me.lon, p.meIsCar ? CAR_HTML : ME_HTML, "Your vehicle", p.meIsCar ? "car" : "me", undefined, 4);
    if (p.gps) put("gps", p.gps.lat, p.gps.lon, GPS_HTML, "Your location", "gps", undefined, 3);
    marks.current.forEach((mk, id) => { if (!seen.has(id)) { mk.m.remove(); marks.current.delete(id); } });
    const dm = marks.current.get("dest");
    if (dm) dm.m.setOffset?.([0, -17]); // pin tip on the point
  }, [ready, p.stations, p.units, p.me, p.meIsCar, p.gps, p.dest, p.highlight, p.selected, p.compatible]);

  // route legs + GPS accuracy (re-applied after style switches)
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !m.getSource("route")) return;
    m.getSource("route").setData({
      type: "FeatureCollection",
      features: (p.legs ?? []).filter((l) => l.path.length > 1).map((l) => ({
        type: "Feature", properties: { color: l.color ?? "#1fd084", dashed: !!l.dashed },
        geometry: { type: "LineString", coordinates: l.path.map(([a, b]) => [b, a]) },
      })),
    });
    m.getSource("gps-acc")?.setData(p.gps && p.gps.accuracy > 15 ? {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [circleRing(p.gps.lat, p.gps.lon, Math.min(p.gps.accuracy, 2000))] } }],
    } : EMPTY);
  }, [ready, styleGen, p.legs, p.gps]);

  // fit the whole trip when a new plan arrives
  const fitKey = (p.legs ?? []).map((l) => `${l.path.length}:${l.path[0]}:${l.path[l.path.length - 1]}`).join("|");
  useEffect(() => {
    const m = map.current;
    const pts = (p.legs ?? []).flatMap((l) => l.path);
    if (!ready || !m || pts.length < 2 || !p.fit) return;
    const lats = pts.map((x) => x[0]), lons = pts.map((x) => x[1]);
    try {
      m.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
        { padding: { top: 70, bottom: 60, left: 50, right: 50 }, maxZoom: 14.5, duration: 700 });
    } catch { /* ignore */ }
  }, [ready, fitKey, p.fit]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (ready && p.focus) map.current?.flyTo({ center: [p.focus[1], p.focus[0]], zoom: Math.max(map.current.getZoom(), 13), duration: 700 });
  }, [ready, p.focus]);

  useEffect(() => {
    if (map.current) map.current.getCanvas().style.cursor = p.picking ? "crosshair" : "";
  }, [p.picking, ready]);

  return <div ref={box} className="h-full w-full" />;
}
