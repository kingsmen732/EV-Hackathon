"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

type Kind = "ok" | "error" | "info";
const Ctx = createContext<(msg: string, kind?: Kind) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; kind: Kind }[]>([]);
  const n = useRef(0);
  const push = useCallback((msg: string, kind: Kind = "info") => {
    const id = ++n.current;
    setItems((x) => [...x.slice(-2), { id, msg, kind }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), kind === "error" ? 6000 : 3500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[2000] flex flex-col items-center gap-2 px-4 md:bottom-6">
        {items.map((i) => (
          <div key={i.id} role={i.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex max-w-md items-start gap-2 rounded-xl border px-4 py-2.5 text-sm shadow-2xl backdrop-blur animate-[fadein_.2s_ease-out]
              ${i.kind === "error" ? "border-surge-500/40 bg-ink-900/95 text-surge-400" : i.kind === "ok" ? "border-volt-500/40 bg-ink-900/95 text-volt-300" : "border-ink-600 bg-ink-900/95 text-slate-200"}`}>
            {i.kind === "error" ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : i.kind === "ok" ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <Info size={16} className="mt-0.5 shrink-0" />}
            <span>{i.msg}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
