"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Loader2, LocateFixed } from "lucide-react";
import type { MapProps } from "@/lib/mapIcons";
import { olaStyle, useI18n } from "@/lib/i18n";
import LanguagePicker from "./LanguagePicker";

const Loading = () => <div className="h-full w-full animate-pulse bg-ink-900" aria-busy="true" />;
const OlaMap = dynamic(() => import("./OlaMap"), { ssr: false, loading: Loading });
const LeafletMap = dynamic(() => import("./LiveMap"), { ssr: false, loading: Loading });

const HAS_OLA = !!process.env.NEXT_PUBLIC_OLA_MAPS_API_KEY;

/** Ola Maps with regional-language labels; falls back to Leaflet/CARTO if unavailable. */
export default function MapView({ onLocate, locating, located, ...p }: MapProps & { onLocate?: () => void; locating?: boolean; located?: boolean }) {
  const { lang, mapTheme, t } = useI18n();
  const [fallback, setFallback] = useState(!HAS_OLA);
  const style = olaStyle(lang, mapTheme);
  return (
    <div className="relative h-full w-full">
      {fallback ? <LeafletMap {...p} theme={mapTheme} />
        : <OlaMap {...p} styleUrl={style.url} lang={lang} onFail={() => setFallback(true)} />}
      <div className="absolute right-3 top-3 z-[600]">
        <LanguagePicker forcedLight={!fallback && style.forcedLight} />
      </div>
      {onLocate && (
        <button type="button" onClick={onLocate} title={t("gps.locate")} aria-label={t("gps.locate")}
          className={`absolute bottom-6 right-3 z-[600] grid h-11 w-11 place-items-center rounded-full border border-ink-700 bg-ink-900/95 shadow-lg backdrop-blur transition active:scale-95 md:bottom-4 ${located ? "text-sky-400" : "text-slate-300"}`}>
          {locating ? <Loader2 size={19} className="animate-spin" /> : <LocateFixed size={19} />}
        </button>
      )}
    </div>
  );
}
