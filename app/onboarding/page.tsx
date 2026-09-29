"use client";
import { useRouter } from "next/navigation";
import VehicleWizard from "@/components/garage/VehicleWizard";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

export default function OnboardingPage() {
  const router = useRouter();
  const { user, setUser } = useAuth();
  const { t } = useI18n();
  const first = user?.name.split(" ")[0];
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-3 md:p-6">
      <div>
        <div className="label">{t("onb.step")}</div>
        <h1 className="text-2xl font-semibold">{t("onb.title", { name: first ? `, ${first}` : "" })}</h1>
        <p className="mt-1 text-sm text-slate-400">{t("onb.sub")}</p>
      </div>
      <VehicleWizard onSaved={(u) => { setUser(u); router.replace("/"); }} />
    </div>
  );
}
