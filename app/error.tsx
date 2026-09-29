"use client";
import { RotateCcw } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  const { t } = useI18n();
  return (
    <div className="mx-auto grid min-h-[60dvh] max-w-md place-items-center p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold">{t("err.generic")}</h1>
        <button className="btn-primary mt-4" onClick={reset}><RotateCcw size={16} />{t("common.continue")}</button>
      </div>
    </div>
  );
}
