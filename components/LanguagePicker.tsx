"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Languages, Moon, Sun } from "lucide-react";
import { LANGS, useI18n } from "@/lib/i18n";

export default function LanguagePicker({ forcedLight, compact }: { forcedLight?: boolean; compact?: boolean }) {
  const { lang, setLang, mapTheme, setMapTheme, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, []);
  const cur = LANGS.find((l) => l.code === lang)!;

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label={t("lang.title")}
        className="flex items-center gap-1.5 rounded-xl border border-ink-600 bg-ink-900/95 px-3 py-2 text-sm font-medium shadow-lg backdrop-blur hover:border-slate-500">
        <Languages size={16} className="text-volt-400" />
        {!compact && <span>{cur.native}</span>}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-60 overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl">
          <div className="border-b border-ink-700 px-3 py-2">
            <div className="text-sm font-semibold">{t("lang.title")}</div>
            <div className="text-[11px] text-slate-400">{t("lang.hint")}</div>
          </div>
          <ul className="max-h-72 overflow-y-auto py-1">
            {LANGS.map((l) => (
              <li key={l.code}>
                <button type="button" role="menuitemradio" aria-checked={l.code === lang}
                  onClick={() => { setLang(l.code); setOpen(false); }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-ink-800 ${l.code === lang ? "text-volt-300" : ""}`}>
                  <span>{l.native}<span className="ml-2 text-[11px] text-slate-500">{l.english}</span></span>
                  {l.code === lang && <Check size={15} />}
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-ink-700 p-2">
            <div className="mb-1 px-1 text-[11px] text-slate-400">{t("map.theme")}</div>
            <div className="seg">
              <button type="button" aria-pressed={mapTheme === "dark"} onClick={() => setMapTheme("dark")}><Moon size={13} className="mr-1 inline" />{t("map.dark")}</button>
              <button type="button" aria-pressed={mapTheme === "light"} onClick={() => setMapTheme("light")}><Sun size={13} className="mr-1 inline" />{t("map.light")}</button>
            </div>
            {forcedLight && <p className="mt-1.5 px-1 text-[11px] text-amp-400">{t("map.lightOnly")}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
