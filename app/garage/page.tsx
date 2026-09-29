"use client";
import { useState } from "react";
import Link from "next/link";
import { Car, CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { GarageVehicle, User } from "@/lib/types";
import VehicleWizard, { ProfileStrip } from "@/components/garage/VehicleWizard";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/toast";

const CONN_NAME: Record<string, string> = { CCS2: "CCS2", TYPE2: "Type 2", GBT: "Bharat DC-001", BAC001: "Bharat AC-001", LECCS: "LECCS" };

export default function GaragePage() {
  const { user, setUser, loading } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const [editing, setEditing] = useState<GarageVehicle | "new" | null>(null);
  async function run(path: string, method: string) {
    try { setUser(await api<User>(path, { method })); }
    catch (e) { toast(e instanceof Error ? e.message : t("err.generic"), "error"); }
  }

  if (loading || !user) return <div className="mx-auto max-w-4xl space-y-3 p-6"><div className="skeleton h-8 w-40" /><div className="skeleton h-48" /></div>;

  if (editing) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-3 md:p-6">
        <h1 className="text-2xl font-semibold">{editing === "new" ? t("gar.addTitle") : t("gar.editTitle", { car: `${editing.make} ${editing.model}` })}</h1>
        <VehicleWizard initial={editing === "new" ? null : editing} onCancel={() => setEditing(null)}
          onSaved={(u) => { setUser(u); setEditing(null); }} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-3 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("gar.title")}</h1>
          <p className="text-sm text-slate-400">{user.name} · {user.email} · {t("nav.plan")}: {user.tier === "fleet" ? "Fleet Pro" : user.tier === "plus" ? "Plus" : "Basic"}</p>
        </div>
        <button className="btn-primary" disabled={user.vehicles.length >= 5} onClick={() => setEditing("new")}><Plus size={16} />{t("gar.add")}</button>
      </div>
      {user.vehicles.length === 0 && (
        <div className="card p-8 text-center">
          <Car className="mx-auto text-slate-500" />
          <p className="mt-2 text-sm text-slate-400">{t("gar.empty")} <Link href="/onboarding" className="text-volt-400">{t("gar.addFirst")}</Link></p>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {user.vehicles.map((g) => {
          const active = user.active_vehicle === g.id;
          return (
            <div key={g.id} className={`card p-4 ${active ? "border-volt-500/60" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 font-semibold">{g.nickname || `${g.make} ${g.model}`}
                    {active && <span className="chip bg-volt-500 text-ink-950"><CheckCircle2 size={11} />{t("gar.active")}</span>}</div>
                  <div className="text-xs text-slate-400">{[g.nickname ? `${g.make} ${g.model}` : null, g.variant, g.year, g.registration].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="flex gap-1">
                  <button className="rounded-lg p-2 text-slate-400 hover:bg-ink-800" title={t("common.edit")} aria-label={t("common.edit")} onClick={() => setEditing(g)}><Pencil size={15} /></button>
                  <button className="rounded-lg p-2 text-slate-400 hover:bg-ink-800 hover:text-surge-400" title="×" aria-label="Remove"
                    onClick={() => confirm(t("gar.remove", { car: `${g.make} ${g.model}` })) && run(`/me/vehicles/${g.id}`, "DELETE")}><Trash2 size={15} /></button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {g.connectors.map((c) => <span key={c} className="chip bg-ink-700 text-slate-200">{CONN_NAME[c] ?? c}</span>)}
                <span className="chip bg-ink-700 text-slate-200">{g.battery_kwh} kWh</span>
                <span className="chip bg-ink-700 text-slate-200">{g.max_dc_kw ? `${g.max_dc_kw} kW DC` : "AC only"} · {g.max_ac_kw} kW AC</span>
              </div>
              <div className="mt-3"><ProfileStrip p={g.profile} compact /></div>
              {!active && <button className="btn-ghost mt-3 w-full" onClick={() => run(`/me/vehicles/${g.id}/activate`, "POST")}>{t("gar.use")}</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
