"use client";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import { Circle, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { Station } from "@/lib/types";
import { CAR_HTML, CENTER, DEST_HTML, GPS_HTML, type MapProps, stationHtml, stationTitle } from "@/lib/mapIcons";

function stationIcon(s: Station, highlighted: boolean, selected: boolean, usable: boolean) {
  const { html, size } = stationHtml(s, highlighted, selected, usable);
  return L.divIcon({ className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2], html });
}

const html = (h: string, w: number, hh: number, anchor?: [number, number]) =>
  L.divIcon({ className: "", iconSize: [w, hh], iconAnchor: anchor ?? [w / 2, hh / 2], html: h });

const meIcon = L.divIcon({
  className: "",
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  html: `<div style="position:relative;width:22px;height:22px"><div class="pulse-ring" style="position:absolute;inset:0;border-radius:50%;background:rgba(56,189,248,.45)"></div><div style="position:absolute;inset:4px;border-radius:50%;background:#38bdf8;border:3px solid #fff"></div></div>`,
});

const unitIcon = (busy: boolean) => L.divIcon({
  className: "",
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  html: `<div style="width:24px;height:24px;border-radius:7px;background:${busy ? "#f5a524" : "#0ea5e9"};border:2px solid #070b10;display:grid;place-items:center;font:800 10px/1 monospace;color:#070b10">MU</div>`,
});

function Events({ onPick, picking }: { onPick?: (lat: number, lon: number) => void; picking?: boolean }) {
  useMapEvents({ click: (e) => { if (picking && onPick) onPick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

function Focus({ focus }: { focus?: [number, number] | null }) {
  const map = useMap();
  useEffect(() => { if (focus) map.flyTo(focus, Math.max(map.getZoom(), 13), { duration: 0.6 }); }, [focus, map]);
  return null;
}

export default function LiveMap(p: MapProps & { theme?: "dark" | "light" }) {
  const hl = useMemo(() => new Set(p.highlight ?? []), [p.highlight]);
  return (
    <MapContainer center={CENTER} zoom={12} zoomControl={false} className={`h-full w-full ${p.picking ? "cursor-crosshair" : ""}`} attributionControl>
      <TileLayer
        url={`https://{s}.basemaps.cartocdn.com/${p.theme === "light" ? "light_all" : "dark_all"}/{z}/{x}/{y}{r}.png`}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        subdomains="abcd" maxZoom={19}
      />
      <Events onPick={p.onPick} picking={p.picking} />
      <Focus focus={p.focus} />
      {(p.legs ?? []).filter((l) => l.path.length > 1).map((l, i) => (
        <Polyline key={i} positions={l.path}
          pathOptions={{ color: l.color ?? "#1fd084", weight: 4, dashArray: l.dashed ? "8 8" : undefined, opacity: 0.9 }} />
      ))}
      {p.gps && p.gps.accuracy > 15 && (
        <Circle center={[p.gps.lat, p.gps.lon]} radius={Math.min(p.gps.accuracy, 2000)}
          pathOptions={{ color: "#38bdf8", weight: 1, fillOpacity: 0.12 }} />
      )}
      {p.stations.map((s) => (
        <Marker key={s.id} position={[s.lat, s.lon]} icon={stationIcon(s, hl.has(s.id), p.selected === s.id, !p.compatible || p.compatible.has(s.id))}
          eventHandlers={{ click: () => p.onSelect?.(s.id) }}>
          <Tooltip direction="top" offset={[0, -16]} opacity={0.95}>
            <span className="text-xs">{stationTitle(s, !p.compatible || p.compatible.has(s.id))}</span>
          </Tooltip>
        </Marker>
      ))}
      {p.units?.map((u) => (
        <Marker key={u.id} position={[u.lat, u.lon]} icon={unitIcon(u.status !== "idle")}>
          <Tooltip direction="top" offset={[0, -12]}>{"Mobile charging van"}</Tooltip>
        </Marker>
      ))}
      {p.dest && <Marker position={[p.dest.lat, p.dest.lon]} icon={html(DEST_HTML, 30, 38, [15, 37])} zIndexOffset={800} />}
      {p.me && <Marker position={[p.me.lat, p.me.lon]} icon={p.meIsCar ? html(CAR_HTML, 26, 26) : meIcon} zIndexOffset={1000} />}
      {p.gps && <Marker position={[p.gps.lat, p.gps.lon]} icon={html(GPS_HTML, 20, 20)} zIndexOffset={900} />}
    </MapContainer>
  );
}
