import type { Station } from "./types";
import { TONE_HEX, waitTone } from "./format";

export interface MapProps {
  stations: Station[];
  units?: { id: string; lat: number; lon: number; status: string; energy_kwh?: number }[];
  traffic?: { lat: number; lon: number; to: string }[];
  me?: { lat: number; lon: number } | null;
  route?: { from: [number, number]; to: [number, number]; color?: string } | null;
  routePath?: [number, number][] | null; // real road geometry [lat, lon]
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
