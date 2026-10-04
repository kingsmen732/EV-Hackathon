import type { Station } from "./types";
import { TONE_HEX, waitTone } from "./format";

export interface MapProps {
  stations: Station[];
  units?: { id: string; lat: number; lon: number; status: string; energy_kwh?: number }[];
  traffic?: { lat: number; lon: number; to: string }[];
  me?: { lat: number; lon: number } | null;
  /** Show `me` as a car (during a trip) instead of a plain dot. */
  meIsCar?: boolean;
  /** Real device location (GPS) with accuracy radius in metres. */
  gps?: { lat: number; lon: number; accuracy: number } | null;
  /** Trip destination pin. */
  dest?: { lat: number; lon: number; label?: string | null } | null;
  /** Route legs to draw, in order (start → stop → destination). Coordinates are [lat, lon]. */
  legs?: { path: [number, number][]; color?: string; dashed?: boolean }[] | null;
  /** Fit the map to the legs whenever they change. */
  fit?: boolean;
  highlight?: string[];
  selected?: string | null;
  compatible?: Set<string> | null; // station ids usable by the active vehicle
  onSelect?: (id: string) => void;
  onPick?: (lat: number, lon: number) => void;
  picking?: boolean;
  focus?: [number, number] | null;
}

export const CENTER: [number, number] = [13.02, 80.215];

export function stationHtml(s: Station, highlighted: boolean, selected: boolean, usable: boolean) {
  const waits = [s.wait_dc, s.wait_ac].filter((x): x is number => x != null);
  const best = waits.length ? Math.min(...waits) : null;
  const free = s.chargers.filter((c) => c.status === "free").length;
  const color = !usable ? "#334155" : s.kind === "shared" ? TONE_HEX.share : !s.open ? TONE_HEX.none : TONE_HEX[waitTone(best)];
  const size = selected ? 38 : highlighted ? 34 : usable ? 28 : 22;
  const ring = selected ? "0 0 0 3px #fff" : highlighted ? "0 0 0 3px rgba(255,255,255,.55)" : "0 0 0 2px rgba(7,11,16,.9)";
  const radius = s.kind === "shared" ? "8px" : "50%";
  const label = !usable ? "×" : s.open ? String(free) : "–";
  const badge = s.queue > 0 && usable
    ? `<span style="position:absolute;top:-6px;right:-6px;background:#070b10;color:#fff;border:1px solid ${color};border-radius:9px;padding:1px 4px;font-size:9px">${s.queue}q</span>` : "";
  return {
    size,
    html: `<div style="position:relative;width:${size}px;height:${size}px;border-radius:${radius};background:${color};opacity:${usable ? 1 : 0.55};box-shadow:${ring},0 4px 14px rgba(0,0,0,.5);display:grid;place-items:center;color:${usable ? "#070b10" : "#94a3b8"};font:700 ${selected ? 14 : 12}px/1 var(--font-mono),monospace;cursor:pointer">${label}${badge}</div>`,
  };
}

export function stationTitle(s: Station, usable: boolean) {
  if (!usable) return `${s.name} — no compatible connector for your vehicle`;
  return s.kind === "shared"
    ? `${s.name} · shared host ₹${s.host_price}/kWh · ${s.open ? "open" : "closed"}`
    : `${s.name} · DC wait ${s.wait_dc ?? "—"} min · AC ${s.wait_ac ?? "—"} min · queue ${s.queue}`;
}

export const ME_HTML = `<div style="position:relative;width:22px;height:22px"><div class="pulse-ring" style="position:absolute;inset:0;border-radius:50%;background:rgba(56,189,248,.45)"></div><div style="position:absolute;inset:4px;border-radius:50%;background:#38bdf8;border:3px solid #fff"></div></div>`;

export const unitHtml = (busy: boolean) =>
  `<div style="width:24px;height:24px;border-radius:7px;background:${busy ? "#f5a524" : "#0ea5e9"};border:2px solid #070b10;display:grid;place-items:center;font:800 10px/1 monospace;color:#070b10">MU</div>`;

export const GPS_HTML = `<div style="position:relative;width:20px;height:20px"><div class="pulse-ring" style="position:absolute;inset:0;border-radius:50%;background:rgba(56,189,248,.5)"></div><div style="position:absolute;inset:3px;border-radius:50%;background:#38bdf8;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5)"></div></div>`;

export const CAR_HTML = `<div style="width:26px;height:26px;border-radius:9px;background:#1fd084;border:2px solid #fff;display:grid;place-items:center;box-shadow:0 3px 10px rgba(0,0,0,.5)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#070b10" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11l1.5-4.5h11L19 11"/><rect x="3" y="11" width="18" height="6" rx="2"/><path d="M7 17v2M17 17v2"/></svg></div>`;

export const DEST_HTML = `<div style="position:relative;width:30px;height:38px"><svg width="30" height="38" viewBox="0 0 30 38"><path d="M15 37C15 37 28 23.5 28 14A13 13 0 0 0 2 14C2 23.5 15 37 15 37Z" fill="#f04d4d" stroke="#fff" stroke-width="2"/><circle cx="15" cy="14" r="5" fill="#fff"/></svg></div>`;

/** 48-gon approximating a circle of `m` metres around a point; returns [lon, lat] ring. */
export function circleRing(lat: number, lon: number, m: number): [number, number][] {
  const out: [number, number][] = [];
  const dLat = m / 111320, dLon = m / (111320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * 2 * Math.PI;
    out.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return out;
}
