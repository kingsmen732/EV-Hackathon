"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import type { MapProps } from "@/lib/mapIcons";
import { olaStyle, useI18n } from "@/lib/i18n";
import LanguagePicker from "./LanguagePicker";

const Loading = () => <div className="h-full w-full animate-pulse bg-ink-900" aria-busy="true" />;
const OlaMap = dynamic(() => import("./OlaMap"), { ssr: false, loading: Loading });
const LeafletMap = dynamic(() => import("./LiveMap"), { ssr: false, loading: Loading });

const HAS_OLA = !!process.env.NEXT_PUBLIC_OLA_MAPS_API_KEY;

/** Ola Maps with regional-language labels; falls back to Leaflet/CARTO if unavailable. */
export default function MapView(p: MapProps) {
  const { lang, mapTheme } = useI18n();
  const [fallback, setFallback] = useState(!HAS_OLA);
  const style = olaStyle(lang, mapTheme);
  return (
    <div className="relative h-full w-full">
      {fallback ? <LeafletMap {...p} theme={mapTheme} />
        : <OlaMap {...p} styleUrl={style.url} lang={lang} onFail={() => setFallback(true)} />}
      <div className="absolute right-3 top-3 z-[600]">
        <LanguagePicker forcedLight={!fallback && style.forcedLight} />
      </div>
    </div>
  );
}
