"use client";

import { Settings } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { useSession } from "@/lib/session";
import { AccountTab } from "./account-tab";
import { EngineTab } from "./engine-tab";
import { PublicPlayerCard } from "./public-player-card";
import { StationTab } from "./station-tab";
import { TeamTab } from "./team-tab";

type TabId = "cuenta" | "equipo" | "emisora" | "motor";

export function SettingsView() {
  const { station, allowed } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Cada pestaña exige su permiso; "Mi cuenta" está siempre.
  const tabs: { id: TabId; label: string }[] = [
    { id: "cuenta", label: "Mi cuenta" },
    ...(allowed("users:manage") ? [{ id: "equipo" as const, label: "Equipo" }] : []),
    ...(allowed("stations:manage") && station ? [{ id: "emisora" as const, label: "Emisora" }] : []),
    ...(allowed("agents:manage") && station ? [{ id: "motor" as const, label: "Motor de audio" }] : []),
  ];

  // La pestaña va en la URL; si piden una que no corresponde, se muestra la primera.
  const requested = searchParams.get("pestana");
  const tab: TabId = tabs.some((item) => item.id === requested) ? (requested as TabId) : "cuenta";
  const setTab = (next: TabId) => router.replace(next === "cuenta" ? pathname : `${pathname}?pestana=${next}`, { scroll: false });

  return (
    <>
      <PageHeader
        title="Ajustes"
        description="Tu cuenta y, si sos dueño, el equipo, la emisora y la conexión del motor de audio."
        actions={tabs.length > 1 ? <Segmented options={tabs} value={tab} onChange={setTab} label="Secciones de ajustes" /> : undefined}
      />

      {tab === "cuenta" && <AccountTab />}
      {tab === "equipo" && <TeamTab timeZone={station?.timezone ?? "UTC"} />}
      {tab === "emisora" && station && (
        <div className="grid gap-6">
          <StationTab key={`${station.id}-${station.name}-${station.timezone}`} station={station} />
          <PublicPlayerCard station={station} />
        </div>
      )}
      {tab === "motor" && station && <EngineTab station={station} />}
      {(tab === "emisora" || tab === "motor") && !station && (
        <Card>
          <EmptyState icon={Settings} title="Todavía no hay emisoras" />
        </Card>
      )}
    </>
  );
}
