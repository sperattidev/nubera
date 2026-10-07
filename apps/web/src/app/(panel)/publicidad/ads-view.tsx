"use client";

import { Megaphone } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdvertisers } from "@/lib/ads-queries";
import { useSession } from "@/lib/session";
import { AdvertisersTab } from "./advertisers-tab";
import { CampaignsTab } from "./campaigns-tab";
import { CertificatesTab } from "./certificates-tab";

const TABS = [
  { id: "campanas", label: "Campañas" },
  { id: "anunciantes", label: "Anunciantes" },
  { id: "certificados", label: "Certificados" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function AdsView() {
  const { station, allowed } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const advertisers = useAdvertisers();

  // La pestaña va en la URL: se puede compartir y "atrás" funciona como se espera.
  const requested = searchParams.get("pestana");
  const tab: TabId = TABS.some((item) => item.id === requested) ? (requested as TabId) : "campanas";
  const setTab = (next: TabId) => router.replace(next === "campanas" ? pathname : `${pathname}?pestana=${next}`, { scroll: false });

  if (!station) {
    return (
      <>
        <PageHeader title="Publicidad" />
        <Card>
          <EmptyState icon={Megaphone} title="Todavía no hay emisoras" description="Las campañas se arman por emisora." />
        </Card>
      </>
    );
  }

  const canWrite = allowed("ads:write");
  const items = advertisers.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Publicidad"
        description="Anunciantes, campañas y el certificado de emisión que le entregás a cada comercio."
        actions={<Segmented options={TABS} value={tab} onChange={setTab} label="Secciones de publicidad" />}
      />

      {tab === "anunciantes" ? (
        <AdvertisersTab stationId={station.id} timeZone={station.timezone} canWrite={canWrite} />
      ) : advertisers.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : tab === "campanas" ? (
        <CampaignsTab stationId={station.id} timeZone={station.timezone} canWrite={canWrite} advertisers={items} onGoToAdvertisers={() => setTab("anunciantes")} />
      ) : (
        <CertificatesTab stationId={station.id} stationName={station.name} timeZone={station.timezone} advertisers={items} />
      )}
    </>
  );
}
