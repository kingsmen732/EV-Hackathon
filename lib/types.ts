export type ChargerStatus = "free" | "charging" | "reserved" | "offline";

export interface Charger {
  id: string; kw: number; connector: string; connector_name: string; dc: boolean; status: ChargerStatus;
  max_current_a?: number | null; max_voltage?: number | null;
  soc?: number; kw_now?: number; throttled?: boolean; tier?: string; reserved_eta?: number;
}

export interface Station {
  id: string; name: string; area: string; lat: number; lon: number;
  kind: "public" | "shared"; feeder_id: string; open: boolean; host_price: number | null;
  hours: [number, number]; queue: number; wait_dc: number | null; wait_ac: number | null;
  grid_util?: number; chargers: Charger[];
  forecast?: { delta: number; wait_dc: number | null; wait_ac: number | null }[];
  queue_detail?: { dc: boolean; waited: number; priority: number; reservation: boolean }[];
  pricing?: Record<"dc" | "ac", { price: number }>;
}

export interface FeederForecast { delta: number; base: number; ev: number; ev_req: number; cap: number; util: number; throttle: number }

export interface Feeder {
  id: string; name: string; capacity_kw: number; effective_cap: number; base_kw: number;
  ev_kw: number; req_kw: number; util: number; throttle: number; derated: boolean; stations: string[];
  forecast?: FeederForecast[];
}

export interface Metrics {
  sessions: number; energy_kwh: number; gross: number; commission_markup: number;
  commission_share: number; pass_revenue: number; rescue_revenue: number; platform_revenue: number;
  passes_sold: number; rescues: number; avg_wait_walkin: number; avg_wait_app: number;
  abandoned: number; deferred_kwh: number; peak_shaved_kw: number; green_shifts: number;
  gap_fills: number; routed: number; minutes_saved: number; pred_mae: number | null;
  members: Record<string, number>; mrr: number; charging_now: number; queued_now: number; ev_kw_now: number;
}

export interface SimClock { minute: number; clock: string; hour: number; iso: string; paused: boolean; surge: number; backend: string }

export interface SimEvent { t: number; clock: string; kind: string; text: string; station?: string; vehicle?: string }

export interface Unit { id: string; lat: number; lon: number; status: string; energy_kwh: number }

export interface Snapshot {
  time: SimClock; stations: Station[]; feeders: Feeder[]; units: Unit[];
  traffic: { lat: number; lon: number; to: string }[]; events: SimEvent[]; metrics: Metrics;
}

export interface Reservation {
  id: string; status: "scheduled" | "en_route" | "queued" | "charging" | "completed" | "cancelled";
  station_id: string; station: string; area: string; lat: number; lon: number; charger_id: string; dc: boolean;
  origin: [number, number]; depart_in: number; eta_in: number; eta_clock: string; est_wait: number;
  est_charge: number; price: number; est_cost: number; green_shift: boolean; actual_wait: number | null;
  energy_kwh: number; cost: number; queue_pos?: number | null; connector: string;
  path: [number, number][] | null;
}

export interface Driver {
  id: string; model_key: string; model: string; battery_kwh: number; max_dc_kw: number; max_ac_kw: number;
  nominal_kwh: number; soh: number; year: number; knee: number; connectors: string[]; pack_voltage: number; garage_id: string;
  soc: number; target_soc: number; lat: number; lon: number; tier: string; state: string; range_km: number;
  priority_pass: boolean; reservation?: Reservation;
  session?: { charger_id: string; kw: number; req_kw: number; energy_kwh: number; cost: number; price: number; elapsed: number; throttled: boolean; floor: number };
  rescue?: { unit: string; status: string; lat: number; lon: number; eta_in: number; delivered_kwh: number };
}

export interface MatchOption {
  quote_id: string; station_id: string; name: string; area: string; kind: string; lat: number; lon: number;
  feeder_id: string; charger_id: string; charger_kw: number; dc: boolean; distance_km: number;
  connector: string; delivered_kw: number; limit: string; live_route: boolean;
  travel_min: number; arrive_soc: number; wait_min: number; charge_min: number; depart_delay: number;
  total_min: number; energy_kwh: number; price_per_kwh: number; base_per_kwh: number; commission_rate: number;
  est_cost: number; grid_util: number; throttle: number; arrive_clock: string; done_clock: string;
  score: number; factors: { time: number; cost: number; grid: number }; reasons: string[]; tags: string[];
}

export interface MatchResult {
  options: MatchOption[];
  nearest: { station_id: string; name: string; area: string; wait_min: number; total_min: number } | null;
  rescue: { available: boolean; callout: number; per_kwh: number; reason: string } | null;
  critical: boolean; range_km: number; priority_pass_price: number; clock: string;
  routing: "ola-live" | "model";
  vehicle: { soh: number; usable_kwh: number; max_dc_kw: number; max_ac_kw: number; connectors: string[] };
}

export interface Connector { id: string; name: string; dc: boolean; kind: string; desc: string }

export interface CatalogModel {
  key: string; segment: "car" | "fleet" | "2w"; make: string; model: string; since: number;
  variants: { label: string; battery_kwh: number; max_dc_kw: number }[];
  max_ac_kw: number; connectors: string[]; pack_voltage: number; kwh_per_km: number;
}

export interface Catalog { connectors: Connector[]; makes: string[]; models: CatalogModel[] }

export interface VehicleProfile {
  age_years: number; soh: number; usable_kwh: number; eff_dc_kw: number; eff_ac_kw: number;
  taper_knee: number; kwh_per_km: number; range_full_km: number; dc_capable: boolean; ac_capable: boolean;
  notes: string[]; compatible_bays?: number; compatible_stations?: number; best_kw?: number; minutes_20_80?: number | null;
}

export interface GarageVehicleInput {
  catalog_key: string | null; make: string; model: string; variant: string | null; year: number;
  connectors: string[]; battery_kwh: number; max_dc_kw: number; max_ac_kw: number; pack_voltage: number;
  kwh_per_km: number; odometer_km: number | null; nickname: string | null; registration: string | null;
}

export interface GarageVehicle extends GarageVehicleInput { id: string; profile: VehicleProfile }

export interface User {
  id: string; email: string; name: string; phone: string | null; tier: string; created: number; lang?: string;
  vehicles: GarageVehicle[]; active_vehicle: string | null; drive_id?: string | null;
}

export interface Plan { id: string; name: string; price_month: number; priority: number; markup_mult: number; throttle_floor: number; hold_min: number; perks: string[] }
