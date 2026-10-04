"use client";
import { type AiResult, type EngineKind, run } from "./engine";

export interface TripIntent {
  destination: string | null;
  preference: "balanced" | "fastest" | "cheapest" | "greenest" | null;
  flexible_min: 0 | 30 | 60 | 120 | 180 | null;
  target_soc: number | null;
  soc: number | null;
  priority_pass: boolean | null;
}
export interface IntentResult { intent: TripIntent; engine: EngineKind; model: string; ms: number }

const PREFS = ["balanced", "fastest", "cheapest", "greenest"] as const;
const FLEX = [0, 30, 60, 120, 180] as const;
const snap = (m: number) => FLEX.reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a));

// ---------------------------------------------------------------- deterministic fallback
const KW = {
  cheapest: /cheap|low(est)? (cost|price)|budget|save money|sast[ai]|सस्त|மலிவ|విలువ తక్కువ|చౌక|ಅಗ್ಗ|ചെലവ് കുറ|स्वस्त/i,
  fastest: /fast|quick|urgent|hurry|asap|soon(est)?|jald[ie]|जल्द|तेज़|तेज|விரைவ|வேகம|త్వరగా|వేగ|ಬೇಗ|ವೇಗ|വേഗ|जलद|लवकर/i,
  greenest: /green|eco|clean|off.?peak|solar|grid.?friendly|हरित|பசுமை|పర్యావరణ|ಹಸಿರು|ഹരിത/i,
  pass: /priority|skip (the )?(queue|line)|jump (the )?queue|प्रायोरिटी|முன்னுரிமை|ప్రయారిటీ|ಆದ್ಯತ|പ്രയോറിറ്റി|मुन्नुरिमै/i,
  flex: /wait|later|flexib|leave (in|after|within)|no rush|not in a hurry|बाद में|रुक|பின்னர்|காத்திரு|తర్వాత|ನಂತರ|പിന്നീട്|नंतर/i,
};

export function ruleIntent(text: string, places: string[]): TripIntent {
  const t = text.trim();
  const out: TripIntent = { destination: null, preference: null, flexible_min: null, target_soc: null, soc: null, priority_pass: null };
  if (KW.cheapest.test(t)) out.preference = "cheapest";
  else if (KW.fastest.test(t)) out.preference = "fastest";
  else if (KW.greenest.test(t)) out.preference = "greenest";
  if (KW.pass.test(t)) out.priority_pass = true;

  // percentages: "charge to 90%" -> target, "at 22%" / "22% left" -> current
  for (const m of t.matchAll(/(charge\s*(?:up\s*)?(?:to|till|until|upto)|to|till|until|upto|तक|வரை|వరకు|ವರೆಗೆ|വരെ|पर्यंत)?\s*(\d{1,3})\s*(?:%|percent|प्रतिशत|சதவீதம்|శాతం)(\s*(?:तक|வரை|వరకు|ವರೆಗೆ|വരെ|पर्यंत))?/gi)) {
    const n = Math.min(100, +m[2]);
    const isTarget = /charge|till|until|upto|तक|வரை|వరకు|ವರೆಗೆ|വരെ|पर्यंत/i.test(`${m[1] ?? ""}${m[3] ?? ""}`);
    if (isTarget && n >= 20) out.target_soc = n; else if (out.soc == null) out.soc = n;
  }

  // flexibility: "in an hour", "30 min", "2 hrs" near a waiting word
  if (KW.flex.test(t)) {
    const h = t.match(/(\d+(?:\.\d+)?|an?|one|two|three|half an?)\s*(h(?:ou)?rs?|hr|घंट|மணி|గంట|ಗಂಟೆ|മണിക്കൂ|तास)/i);
    const mi = t.match(/(\d+)\s*(min|मिनट|நிமி|నిమి|ನಿಮಿ|മിനി|मिनि)/i);
    const word: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, "half a": 0.5, "half an": 0.5 };
    if (h) out.flexible_min = snap((word[h[1].toLowerCase()] ?? +h[1]) * 60);
    else if (mi) out.flexible_min = snap(+mi[1]);
    else out.flexible_min = 60;
  }

  // destination: prefer a known place name, else the phrase after "to / towards / reach"
  const low = t.toLowerCase();
  const known = places.filter((p) => p.length > 2 && low.includes(p.toLowerCase())).sort((a, b) => b.length - a.length)[0];
  if (known) out.destination = known;
  else {
    const m = t.match(/(?:\bto\b|towards|reach(?:ing)?|going to|drive to|trip to|head(?:ing)? to|जाना है|ku pogan?um|ki vellali)\s+(?!charge|\d)([\p{L}][\p{L}\p{M} .'-]{2,40}?)(?=[,.;!?]|\s+(?:by|before|with|and|in|at|i\b|im\b|but|then|via|on)\b|$)/iu);
    if (m) out.destination = m[1].trim();
  }
  return out;
}

// ---------------------------------------------------------------- model prompts
const SYSTEM = `You turn an electric-vehicle driver's request into JSON. Reply with ONE JSON object and nothing else.
Keys:
"destination": place name the driver wants to travel to, or null if they only want to charge nearby
"preference": "fastest" | "cheapest" | "greenest" | "balanced" | null
"flexible_min": minutes the driver can wait before leaving: 0, 30, 60, 120 or 180, or null if not said
"target_soc": battery percent to charge up to, or null
"soc": current battery percent if the driver states it, or null
"priority_pass": true if they ask to skip the queue or want priority, else null
The request may be in English, Hindi, Tamil, Telugu, Kannada, Malayalam or Marathi. Keep place names as written.`;

const SHOTS: [string, TripIntent][] = [
  ["cheapest charge on the way to Tambaram, I can wait an hour",
    { destination: "Tambaram", preference: "cheapest", flexible_min: 60, target_soc: null, soc: null, priority_pass: null }],
  ["I'm at 12% and need a charger right now, skip the queue",
    { destination: null, preference: "fastest", flexible_min: 0, target_soc: null, soc: 12, priority_pass: true }],
  ["मुझे अड्यार जाना है, 90% तक चार्ज करना है",
    { destination: "अड्यार", preference: null, flexible_min: null, target_soc: 90, soc: null, priority_pass: null }],
];

function extractJson(s: string): Record<string, unknown> | null {
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

function clean(raw: Record<string, unknown>): TripIntent {
  const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" || (typeof v === "string" && v.trim() !== "" && !isNaN(+v))) && +v >= lo && +v <= hi ? Math.round(+v) : null;
  const dest = typeof raw.destination === "string" && raw.destination.trim() && !/^(null|none|n\/a)$/i.test(raw.destination.trim()) ? raw.destination.trim().slice(0, 60) : null;
  const pref = PREFS.find((p) => p === String(raw.preference ?? "").toLowerCase()) ?? null;
  const fm = num(raw.flexible_min, 0, 600);
  return {
    destination: dest, preference: pref, flexible_min: fm == null ? null : snap(fm),
    target_soc: num(raw.target_soc, 20, 100), soc: num(raw.soc, 1, 100),
    priority_pass: raw.priority_pass === true ? true : null,
  };
}

/** Natural-language request -> structured trip intent, on a local model (rules if none is available). */
export async function parseIntent(text: string, places: string[]): Promise<IntentResult> {
  const rules = ruleIntent(text, places);
  try {
    const messages = [
      { role: "system" as const, content: SYSTEM },
      ...SHOTS.flatMap(([u, a]) => [{ role: "user" as const, content: u }, { role: "assistant" as const, content: JSON.stringify(a) }]),
      { role: "user" as const, content: text.slice(0, 400) },
    ];
    const r = await run(messages, { maxTokens: 120, json: true });
    const parsed = extractJson(r.text);
    if (!parsed) throw new Error("Model did not return JSON");
    const ai = clean(parsed);
    // numbers are extracted more reliably by rules; language understanding by the model
    const intent: TripIntent = {
      destination: ai.destination ?? rules.destination,
      preference: ai.preference ?? rules.preference,
      flexible_min: rules.flexible_min ?? ai.flexible_min,
      target_soc: rules.target_soc ?? ai.target_soc,
      soc: rules.soc ?? ai.soc,
      priority_pass: ai.priority_pass ?? rules.priority_pass,
    };
    return { intent, engine: r.engine, model: r.model, ms: r.ms };
  } catch {
    return { intent: rules, engine: "rules", model: "", ms: 0 };
  }
}

const LANG_NAME: Record<string, string> = { en: "English", hi: "Hindi", ta: "Tamil", te: "Telugu", kn: "Kannada", ml: "Malayalam", mr: "Marathi" };

/** Two-sentence explanation of a recommendation in the driver's language. */
export async function explain(facts: Record<string, unknown>, lang: string): Promise<AiResult> {
  return run([
    { role: "system", content: `You are a friendly EV charging assistant. Using only the facts given, explain in ${LANG_NAME[lang] ?? "English"} why this charging option was recommended. Write 2 short sentences in plain words for a driver. Do not invent numbers. Do not use lists.` },
    { role: "user", content: JSON.stringify(facts) },
  ], { maxTokens: 160, heavy: true });
}
