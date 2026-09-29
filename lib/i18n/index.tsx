"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import en, { type Key } from "./en";
import { api, store } from "../api";
import { useAuth } from "../auth";

export type Lang = "en" | "hi" | "ta" | "te" | "kn" | "ml" | "mr";
export type MapTheme = "dark" | "light";

export const LANGS: { code: Lang; native: string; english: string }[] = [
  { code: "en", native: "English", english: "English" },
  { code: "hi", native: "हिन्दी", english: "Hindi" },
  { code: "ta", native: "தமிழ்", english: "Tamil" },
  { code: "te", native: "తెలుగు", english: "Telugu" },
  { code: "kn", native: "ಕನ್ನಡ", english: "Kannada" },
  { code: "ml", native: "മലയാളം", english: "Malayalam" },
  { code: "mr", native: "मराठी", english: "Marathi" },
];

// Ola Maps (Krutrim) vector styles with regional-language labels.
const OLA = "https://api.olamaps.io/tiles/vector/v1/styles";
const DARK: Partial<Record<Lang, string>> = {
  en: "default-dark-standard", hi: "default-dark-standard-hi", ta: "default-dark-standard-ta",
  te: "default-dark-standard-te", kn: "default-dark-standard-kn", mr: "default-dark-standard-mr",
};
const LIGHT: Record<Lang, string> = {
  en: "default-light-standard", hi: "default-light-standard-hi", ta: "default-light-standard-ta",
  te: "default-light-standard-te", kn: "default-light-standard-kn", ml: "default-light-standard-ml",
  mr: "default-light-standard-mr",
};

export function olaStyle(lang: Lang, theme: MapTheme): { url: string; forcedLight: boolean } {
  const override = process.env.NEXT_PUBLIC_OLA_MAPS_STYLE;
  if (override && lang === "en" && theme === "dark") return { url: override, forcedLight: false };
  const id = theme === "dark" ? DARK[lang] : undefined;
  if (id) return { url: `${OLA}/${id}/style.json`, forcedLight: false };
  return { url: `${OLA}/${LIGHT[lang]}/style.json`, forcedLight: theme === "dark" };
}

const loaders: Record<Exclude<Lang, "en">, () => Promise<{ default: Partial<Record<Key, string>> }>> = {
  hi: () => import("./hi"), ta: () => import("./ta"), te: () => import("./te"),
  kn: () => import("./kn"), ml: () => import("./ml"), mr: () => import("./mr"),
};

type Vars = Record<string, string | number>;
interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  mapTheme: MapTheme;
  setMapTheme: (t: MapTheme) => void;
  t: (k: Key, vars?: Vars) => string;
}

const I18n = createContext<Ctx>({
  lang: "en", setLang: () => {}, mapTheme: "dark", setMapTheme: () => {},
  t: (k) => en[k] ?? k,
});

function fmt(s: string, vars?: Vars) {
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`).toString()) : s;
}

function detect(): Lang {
  const saved = store.get("cm.lang") as Lang | null;
  if (saved && LANGS.some((l) => l.code === saved)) return saved;
  if (typeof navigator !== "undefined") {
    const nav = navigator.language?.slice(0, 2) as Lang;
    if (LANGS.some((l) => l.code === nav)) return nav;
  }
  return "en";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [lang, setLangState] = useState<Lang>("en");
  const [dict, setDict] = useState<Partial<Record<Key, string>>>({});
  const [mapTheme, setThemeState] = useState<MapTheme>("dark");

  useEffect(() => {
    setLangState(detect());
    const th = store.get("cm.mapTheme");
    if (th === "light" || th === "dark") setThemeState(th);
  }, []);

  // adopt the account's saved language on a fresh device
  useEffect(() => {
    const ul = (user as { lang?: Lang } | null)?.lang;
    if (ul && !store.get("cm.lang")) setLangState(ul);
  }, [user]);

  useEffect(() => {
    document.documentElement.lang = lang;
    if (lang === "en") { setDict({}); return; }
    let live = true;
    loaders[lang]().then((m) => { if (live) setDict(m.default); }).catch(() => {});
    return () => { live = false; };
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    store.set("cm.lang", l);
    if (user) api("/me", { method: "PATCH", json: { lang: l } }).catch(() => {});
  }, [user]);

  const setMapTheme = useCallback((t: MapTheme) => { setThemeState(t); store.set("cm.mapTheme", t); }, []);

  const t = useCallback((k: Key, vars?: Vars) => fmt(dict[k] ?? en[k] ?? k, vars), [dict]);

  const value = useMemo(() => ({ lang, setLang, mapTheme, setMapTheme, t }), [lang, setLang, mapTheme, setMapTheme, t]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

export const useI18n = () => useContext(I18n);
export type { Key };
