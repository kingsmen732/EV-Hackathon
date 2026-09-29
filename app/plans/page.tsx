"use client";
import { Check, Clock, Gauge, Sparkles, Timer } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n, type Key } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import { usePoll } from "@/lib/usePoll";
import { inr } from "@/lib/format";
import type { Plan, User } from "@/lib/types";

interface PlansData { plans: Plan[]; priority_pass_now: number; rescue: { callout: number; per_kwh: number }; my_tier: string | null }

const PERKS: Record<string, number> = { basic: 3, plus: 4, fleet: 4 };

export default function PlansPage() {
  const { data } = usePoll<PlansData>("/plans", 15000);
  const { user: me, setUser } = useAuth();
  const { t } = useI18n();
  const toast = useToast();

  async function choose(p: Plan) {
    if (!me) { window.location.href = "/login?next=/plans"; return; }
    try {
      const u = await api<User>("/me", { method: "PATCH", json: { tier: p.id } });
      setUser(u);
      toast(`${t("plans.switched", { name: p.name })} ${t("plans.demo")}`, "ok");
    } catch (e) { toast(e instanceof Error ? e.message : t("err.generic"), "error"); }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4 md:p-8">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-semibold leading-tight">{t("plans.title")}</h1>
        <p className="mt-2 text-slate-400">{t("plans.sub")}</p>
      </header>

      {!data ? (
        <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-80" />)}</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {data.plans.map((p) => {
            const on = (me?.tier ?? data.my_tier) === p.id;
            const hot = p.id === "plus";
            return (
              <article key={p.id} className={`card relative flex flex-col p-6 ${hot ? "border-volt-500/60 md:-translate-y-2" : ""}`}>
                {hot && <span className="chip absolute -top-3 left-6 bg-volt-500 text-ink-950">{t("plans.popular")}</span>}
                <h2 className="text-lg font-semibold">{p.name}</h2>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="font-mono text-4xl font-semibold">{p.price_month ? inr(p.price_month) : t("plans.free")}</span>
                  {p.price_month > 0 && <span className="text-sm text-slate-400">{p.id === "fleet" ? t("plans.vehicleMonth") : t("plans.month")}</span>}
                </div>
                <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                  {Array.from({ length: PERKS[p.id] ?? 0 }, (_, i) => (
                    <li key={i} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-volt-400" />{t(`perk.${p.id}.${i + 1}` as Key)}</li>
                  ))}
                </ul>
                <div className="mt-5 grid grid-cols-3 gap-2 text-center text-[11px] text-slate-400">
                  <Mini icon={Timer} v={`+${p.priority}`} k={t("plans.queue")} />
                  <Mini icon={Gauge} v={`${Math.round(p.throttle_floor * 100)}%`} k={t("plans.floor")} />
                  <Mini icon={Clock} v={`${p.hold_min}m`} k={t("plans.hold")} />
                </div>
                <button className={`${on ? "btn-ghost" : hot ? "btn-primary" : "btn-ghost"} mt-5 !py-3`} disabled={on} onClick={() => choose(p)}>
                  {on ? t("plans.current") : t("plans.choose", { name: p.name })}
                </button>
              </article>
            );
          })}
        </div>
      )}

      {data && (
        <section className="card flex flex-col gap-4 p-6 md:flex-row md:items-center">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-amp-500/15 text-amp-400"><Sparkles /></div>
          <div className="flex-1">
            <h2 className="font-semibold">{t("plans.passTitle")}</h2>
            <p className="text-sm text-slate-400">{t("plans.passSub")}</p>
          </div>
          <div className="text-right">
            <div className="font-mono text-3xl font-semibold">{inr(data.priority_pass_now)}</div>
            <div className="text-xs text-slate-500">{t("plans.now")}</div>
          </div>
        </section>
      )}
      <p className="text-center text-xs text-slate-500">{t("plans.demo")}</p>
    </div>
  );
}

function Mini({ icon: I, v, k }: { icon: React.ElementType; v: string; k: string }) {
  return (
    <div className="rounded-xl bg-ink-850 px-1 py-2">
      <I size={14} className="mx-auto mb-0.5 text-slate-500" />
      <div className="font-mono text-sm text-white">{v}</div>
      <div className="leading-tight">{k}</div>
    </div>
  );
}
