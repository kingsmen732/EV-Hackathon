"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export interface GeoFix { lat: number; lon: number; accuracy: number; heading: number | null; speed: number | null; ts: number }
export type GeoStatus = "idle" | "locating" | "on" | "denied" | "unavailable" | "insecure";

/** Area covered by the charging network: all of India (the backend grows the network on demand). */
export const SERVICE_AREA = { minLat: 6.0, maxLat: 37.5, minLon: 68.0, maxLon: 97.5 };
export const inServiceArea = (lat: number, lon: number) =>
  lat >= SERVICE_AREA.minLat && lat <= SERVICE_AREA.maxLat && lon >= SERVICE_AREA.minLon && lon <= SERVICE_AREA.maxLon;

/**
 * Live device location (GPS / fused provider) via watchPosition.
 * Starts automatically when permission was already granted; otherwise call start()
 * from a user gesture so the browser shows its permission prompt.
 */
export function useGeo() {
  const [fix, setFix] = useState<GeoFix | null>(null);
  const [status, setStatus] = useState<GeoStatus>("idle");
  const watch = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
  }, []);

  const start = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) { setStatus("unavailable"); return; }
    if (typeof window !== "undefined" && !window.isSecureContext) { setStatus("insecure"); return; }
    if (watch.current != null) return;
    setStatus((s) => (s === "on" ? s : "locating"));
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        setFix({
          lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy,
          heading: Number.isFinite(p.coords.heading as number) ? p.coords.heading : null,
          speed: Number.isFinite(p.coords.speed as number) ? p.coords.speed : null, ts: p.timestamp,
        });
        setStatus("on");
      },
      (e) => {
        if (e.code === e.PERMISSION_DENIED) { setStatus("denied"); stop(); }
        else setStatus((s) => (s === "on" ? s : "unavailable")); // keep the last fix on timeouts
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
  }, [stop]);

  useEffect(() => {
    let live = true;
    navigator.permissions?.query({ name: "geolocation" as PermissionName })
      .then((p) => { if (live && p.state === "granted") start(); })
      .catch(() => {});
    return () => { live = false; stop(); };
  }, [start, stop]);

  return { fix, status, start, stop, inArea: fix ? inServiceArea(fix.lat, fix.lon) : null };
}
