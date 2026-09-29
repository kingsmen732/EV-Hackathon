"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, Gauge, Loader2, Lock, Mail, Phone, ShieldCheck, User as UserIcon, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import LanguagePicker from "@/components/LanguagePicker";
import type { User } from "@/lib/types";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const { setUser } = useAuth();
  const { t } = useI18n();
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const signup = mode === "signup";
  const next = params.get("next");

  const pwChecks = [
    { ok: f.password.length >= 8, t: t("auth.pw8") },
    { ok: /[A-Za-z]/.test(f.password) && /\d/.test(f.password), t: t("auth.pwMix") },
  ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const u = await api<User>(signup ? "/auth/signup" : "/auth/login", {
        method: "POST",
        json: signup ? { name: f.name, email: f.email, password: f.password, phone: f.phone || null } : { email: f.email, password: f.password },
      });
      setUser(u);
      const dest = u.vehicles.length === 0 ? "/onboarding" : next && next.startsWith("/") ? next : "/";
      router.replace(dest);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("err.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-[calc(100dvh-56px)] md:grid-cols-2">
      <section className="relative hidden overflow-hidden border-r border-ink-700 bg-gradient-to-br from-ink-900 via-ink-950 to-ink-950 p-10 md:flex md:flex-col md:justify-between">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-volt-500/10 blur-3xl" />
        <div className="flex items-center gap-2 text-lg font-semibold">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-volt-500 text-ink-950"><Zap size={20} strokeWidth={2.5} /></span>
          ChargeMesh
        </div>
        <div className="max-w-md space-y-6">
          <h2 className="text-3xl font-semibold leading-tight">{t("auth.hero")}</h2>
          <ul className="space-y-4 text-sm text-slate-300">
            <li className="flex gap-3"><ShieldCheck className="shrink-0 text-volt-400" size={20} />{t("auth.b1")}</li>
            <li className="flex gap-3"><Gauge className="shrink-0 text-volt-400" size={20} />{t("auth.b2")}</li>
            <li className="flex gap-3"><Zap className="shrink-0 text-volt-400" size={20} />{t("auth.b3")}</li>
          </ul>
        </div>
        <p className="text-xs text-slate-500">Chennai · Ola Maps</p>
      </section>

      <section className="flex items-center justify-center p-5">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <div>
            <div className="flex items-start justify-between gap-3"><h1 className="text-2xl font-semibold">{signup ? t("auth.create") : t("auth.welcome")}</h1><LanguagePicker compact /></div>
            <p className="mt-1 text-sm text-slate-400">
              {signup ? t("auth.signupSub") : t("auth.loginSub")}
            </p>
          </div>

          {err && <div role="alert" className="rounded-xl border border-surge-500/40 bg-surge-500/10 px-3 py-2 text-sm text-surge-400">{err}</div>}

          {signup && (
            <Field icon={UserIcon} label={t("auth.name")}>
              <input required minLength={2} autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Mithilesh B" />
            </Field>
          )}
          <Field icon={Mail} label={t("auth.email")}>
            <input required type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="you@example.com" />
          </Field>
          {signup && (
            <Field icon={Phone} label={t("auth.mobile")}>
              <input type="tel" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+91 98765 43210" />
            </Field>
          )}
          <Field icon={Lock} label={t("auth.password")} trailing={
            <button type="button" onClick={() => setShow(!show)} className="text-slate-400 hover:text-white" aria-label={show ? "Hide password" : "Show password"}>
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>}>
            <input required minLength={8} type={show ? "text" : "password"} autoComplete={signup ? "new-password" : "current-password"}
              value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="••••••••" />
          </Field>
          {signup && f.password && (
            <div className="flex gap-3 text-[11px]">
              {pwChecks.map((c) => <span key={c.t} className={c.ok ? "text-volt-400" : "text-slate-500"}>{c.ok ? "✓" : "•"} {c.t}</span>)}
            </div>
          )}

          <button className="btn-primary w-full" disabled={busy}>
            {busy && <Loader2 size={16} className="animate-spin" />}{signup ? t("auth.signup") : t("auth.login")}
          </button>

          <p className="text-center text-sm text-slate-400">
            {signup ? <>{t("auth.have")} <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-volt-400 hover:underline">{t("auth.login")}</Link></>
              : <>{t("auth.new")} <Link href="/signup" className="text-volt-400 hover:underline">{t("auth.createLink")}</Link></>}
          </p>
        </form>
      </section>
    </div>
  );
}

function Field({ icon: I, label, children, trailing }: { icon: React.ElementType; label: string; children: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <span className="mt-1.5 flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-850 px-3 focus-within:border-volt-500/70">
        <I size={16} className="shrink-0 text-slate-500" />
        <span className="flex-1 [&>input]:w-full [&>input]:bg-transparent [&>input]:py-2.5 [&>input]:text-sm [&>input]:outline-none">{children}</span>
        {trailing}
      </span>
    </label>
  );
}
