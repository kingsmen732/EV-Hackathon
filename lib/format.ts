export const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
export const mins = (m: number | null | undefined) => {
  if (m == null) return "—";
  if (m < 1) return "<1 min";
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  return r ? `${h}h ${r}m` : `${h}h`;
};
export const pct = (x: number) => `${Math.round(x * 100)}%`;
export function waitTone(w: number | null | undefined): "good" | "warn" | "bad" | "none" {
  if (w == null) return "none";
  if (w <= 5) return "good";
  if (w <= 20) return "warn";
  return "bad";
}
export function utilTone(u: number): "good" | "warn" | "bad" {
  if (u < 0.85) return "good";
  if (u < 0.93) return "warn";
  return "bad";
}
export const TONE_HEX = { good: "#1fd084", warn: "#f5a524", bad: "#f04d4d", none: "#5b6b7c", share: "#9a7bff" } as const;
