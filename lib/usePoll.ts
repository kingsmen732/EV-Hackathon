"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

/** Polls a GET endpoint; pauses while the tab is hidden. */
export function usePoll<T>(path: string | null, intervalMs = 1500) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (!path) return;
    try {
      const d = await api<T>(path);
      if (alive.current) { setData(d); setError(null); }
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "Network error");
    }
  }, [path]);

  useEffect(() => {
    alive.current = true;
    if (!path) return;
    let first = true;
    const loop = async () => {
      // Always fetch once on mount (a tab can start hidden: background tab, PWA launch,
      // embedded webview); after that, skip polling while hidden.
      if (first || typeof document === "undefined" || document.visibilityState === "visible") await load();
      first = false;
      if (alive.current) timer.current = setTimeout(loop, intervalMs);
    };
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    loop();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [path, intervalMs, load]);

  return { data, error, refresh: load, setData };
}
