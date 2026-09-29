"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BadgeIndianRupee, Car, LogIn, LogOut, Navigation, Zap } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import LanguagePicker from "./LanguagePicker";

const BARE = ["/login", "/signup"];

export default function Nav() {
  const path = usePathname();
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (menu.current && !menu.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, []);
  const LINKS = [
    { href: "/", label: t("nav.drive"), icon: Navigation },
    { href: "/garage", label: t("nav.garage"), icon: Car },
    { href: "/plans", label: t("nav.plans"), icon: BadgeIndianRupee },
  ];
  const bare = BARE.includes(path);
  const initials = user?.name.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  const tier = user?.tier === "fleet" ? "Fleet Pro" : user?.tier === "plus" ? "Plus" : "Basic";

  return (
    <>
      <header className="sticky top-0 z-[1000] border-b border-ink-700/70 bg-ink-950/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-6 px-4 md:px-5">
          <Link href="/" className="flex items-center gap-2 font-semibold" aria-label="ChargeMesh home">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-volt-500 text-ink-950"><Zap size={18} strokeWidth={2.5} /></span>
            ChargeMesh
          </Link>
          {!bare && (
            <nav className="hidden gap-1 md:flex" aria-label="Main">
              {LINKS.map(({ href, label, icon: I }) => {
                const on = href === "/" ? path === "/" : path.startsWith(href);
                return (
                  <Link key={href} href={href} aria-current={on ? "page" : undefined}
                    className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${on ? "bg-ink-800 text-white" : "text-slate-400 hover:text-white"}`}>
                    <I size={16} /> {label}
                  </Link>
                );
              })}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-2">
            {path !== "/" && !bare && <LanguagePicker compact />}
            {user ? (
              <div className="relative" ref={menu}>
                <button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-full border border-ink-700 bg-ink-850 py-1 pl-1 pr-3 text-sm hover:border-ink-600" aria-haspopup="menu" aria-expanded={open}>
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-volt-500/20 font-mono text-xs text-volt-300">{initials}</span>
                  <span className="hidden max-w-[140px] truncate sm:inline">{user.name}</span>
                </button>
                {open && (
                  <div role="menu" className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">
                    <div className="border-b border-ink-700 px-3 py-2.5">
                      <div className="truncate text-sm font-medium">{user.name}</div>
                      <div className="truncate text-xs text-slate-400">{user.email}</div>
                    </div>
                    <Link href="/garage" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-ink-800"><Car size={15} />{t("nav.myGarage")} ({user.vehicles.length})</Link>
                    <Link href="/plans" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-ink-800"><BadgeIndianRupee size={15} />{t("nav.plan")}: {tier}</Link>
                    <button onClick={logout} className="flex w-full items-center gap-2 border-t border-ink-700 px-3 py-2 text-sm text-surge-400 hover:bg-ink-800"><LogOut size={15} />{t("nav.logout")}</button>
                  </div>
                )}
              </div>
            ) : !bare ? (
              <Link href="/login" className="btn-ghost !py-1.5 text-sm"><LogIn size={15} />{t("nav.login")}</Link>
            ) : null}
          </div>
        </div>
      </header>
      {!bare && (
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-[1000] border-t border-ink-700 bg-ink-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          <div className="grid h-16 grid-cols-3">
            {LINKS.map(({ href, label, icon: I }) => {
              const on = href === "/" ? path === "/" : path.startsWith(href);
              return (
                <Link key={href} href={href} aria-current={on ? "page" : undefined}
                  className={`flex flex-col items-center justify-center gap-1 text-[11px] ${on ? "text-volt-400" : "text-slate-500"}`}>
                  <I size={20} /> {label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}
