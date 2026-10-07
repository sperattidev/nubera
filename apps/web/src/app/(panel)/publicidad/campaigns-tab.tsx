"use client";

import { localDate } from "@nubera/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Plus, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  campaignPayload,
  campaignStatus,
  campaignToForm,
  flightCaption,
  flightProgress,
  formatDate,
  STATUS_LABEL,
  type Advertiser,
  type Campaign,
  type CampaignStatus,
} from "@/lib/ads";
import { useCampaigns } from "@/lib/ads-queries";
import { api, errorMessage } from "@/lib/api";
import { describeDays } from "@/lib/schedule";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { CampaignEditor, type CampaignTarget } from "./campaign-editor";

const STATUS_TONE = { active: "success", scheduled: "brand", ended: "neutral", paused: "warning" } as const;
const STATUS_ORDER: Record<CampaignStatus, number> = { active: 0, scheduled: 1, paused: 2, ended: 3 };
const FILTERS: { id: CampaignStatus | "all"; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "active", label: "Vigentes" },
  { id: "scheduled", label: "Programadas" },
  { id: "paused", label: "Pausadas" },
  { id: "ended", label: "Finalizadas" },
];

export function CampaignsTab({
  stationId,
  timeZone,
  canWrite,
  advertisers,
  onGoToAdvertisers,
}: {
  stationId: string;
  timeZone: string;
  canWrite: boolean;
  advertisers: Advertiser[];
  onGoToAdvertisers: () => void;
}) {
  const query = useCampaigns(stationId);
  const now = useNow(60_000);
  const today = localDate(new Date(now || Date.now()), timeZone);
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<CampaignStatus | "all">("all");
  const [advertiserId, setAdvertiserId] = useState("all");
  const [target, setTarget] = useState<CampaignTarget | null>(null);

  const campaigns = useMemo(() => query.data?.items ?? [], [query.data]);
  const counts = useMemo(() => {
    const result: Record<CampaignStatus | "all", number> = { all: campaigns.length, active: 0, scheduled: 0, paused: 0, ended: 0 };
    for (const campaign of campaigns) result[campaignStatus(campaign, today)] += 1;
    return result;
  }, [campaigns, today]);

  const visible = useMemo(
    () =>
      campaigns
        .filter((campaign) => (advertiserId === "all" || campaign.advertiserId === advertiserId) && (filter === "all" || campaignStatus(campaign, today) === filter))
        .sort(
          (a, b) =>
            STATUS_ORDER[campaignStatus(a, today)] - STATUS_ORDER[campaignStatus(b, today)] || a.endsOn.localeCompare(b.endsOn) || a.name.localeCompare(b.name),
        ),
    [campaigns, advertiserId, filter, today],
  );

  // Pausar o reanudar sin abrir el editor: se reenvía la campaña completa con el estado cambiado.
  const toggle = useMutation({
    mutationFn: (campaign: Campaign) =>
      api(`/stations/${stationId}/campaigns/${campaign.id}`, {
        method: "PUT",
        body: campaignPayload({ ...campaignToForm(campaign), isActive: !campaign.isActive }),
      }),
    onSuccess: (_data, campaign) => {
      queryClient.invalidateQueries({ queryKey: ["campaigns", stationId] });
      toast.success(campaign.isActive ? `${campaign.name}: pausada` : `${campaign.name}: reanudada`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const canCreate = canWrite && advertisers.some((advertiser) => advertiser.isActive);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
          {FILTERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                filter === id ? "border-primary/50 bg-primary/15 text-primary" : "border-border bg-card/60 text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {label}
              <span className="font-mono text-[11px] tabular-nums opacity-70">{counts[id]}</span>
            </button>
          ))}
        </div>

        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          {advertisers.length > 1 && (
            <Select value={advertiserId} onValueChange={setAdvertiserId}>
              <SelectTrigger className="h-9 min-w-0 flex-1 sm:w-48 sm:flex-none" aria-label="Filtrar por anunciante">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los anunciantes</SelectItem>
                {advertisers.map((advertiser) => (
                  <SelectItem key={advertiser.id} value={advertiser.id}>
                    {advertiser.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {canCreate && (
            <Button className="shrink-0" onClick={() => setTarget({ mode: "create" })}>
              <Plus /> Nueva campaña
            </Button>
          )}
        </div>
      </div>

      {query.isPending ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : query.isError ? (
        <Card>
          <EmptyState
            icon={SearchX}
            title="No se pudieron cargar las campañas"
            action={
              <Button variant="outline" onClick={() => query.refetch()}>
                Reintentar
              </Button>
            }
          />
        </Card>
      ) : campaigns.length === 0 ? (
        <Card>
          <EmptyState
            icon={Megaphone}
            title="Todavía no hay campañas"
            description={
              advertisers.length === 0
                ? "Para empezar, cargá al primer anunciante; después armás su campaña con los avisos de la biblioteca."
                : "Una campaña define qué avisos de un anunciante salen al aire, entre qué fechas y con qué frecuencia."
            }
            action={
              canWrite &&
              (advertisers.length === 0 ? (
                <Button onClick={onGoToAdvertisers}>
                  <Plus /> Cargar un anunciante
                </Button>
              ) : (
                <Button onClick={() => setTarget({ mode: "create" })}>
                  <Plus /> Crear la primera campaña
                </Button>
              ))
            }
          />
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={SearchX}
            title="Ninguna campaña coincide"
            description="Probá con otro estado o con otro anunciante."
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setFilter("all");
                  setAdvertiserId("all");
                }}
              >
                Quitar filtros
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {visible.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              today={today}
              canWrite={canWrite}
              toggling={toggle.isPending && toggle.variables?.id === campaign.id}
              onOpen={() => setTarget({ mode: "edit", campaign })}
              onToggle={() => toggle.mutate(campaign)}
            />
          ))}
        </ul>
      )}

      <CampaignEditor target={target} advertisers={advertisers} stationId={stationId} today={today} canWrite={canWrite} onClose={() => setTarget(null)} />
    </>
  );
}

function CampaignCard({
  campaign,
  today,
  canWrite,
  toggling,
  onOpen,
  onToggle,
}: {
  campaign: Campaign;
  today: string;
  canWrite: boolean;
  toggling: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const status = campaignStatus(campaign, today);
  const progress = flightProgress(campaign, today);
  const ended = status === "ended";

  return (
    <li>
      <Card className={cn("relative transition-colors hover:border-primary/40", ended && "opacity-70")}>
        <button type="button" onClick={onOpen} className="grid w-full gap-4 rounded-xl p-5 text-left" aria-label={`${campaign.name}, ${campaign.advertiserName}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold tracking-tight">{campaign.name}</p>
              <p className="truncate text-[13px] text-muted-foreground">{campaign.advertiserName}</p>
            </div>
            <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>
                {formatDate(campaign.startsOn)} → {formatDate(campaign.endsOn)}
              </span>
              <span>{flightCaption(campaign, today)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-label="Avance de la campaña">
              <div className={cn("h-full rounded-full", ended ? "bg-muted-foreground/50" : "bg-primary")} style={{ width: `${progress * 100}%` }} />
            </div>
          </div>

          <dl className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
            <Meta label="Días" value={describeDays(campaign.days)} />
            <Meta label="Horario" value={campaign.start === "00:00" && campaign.end === "24:00" ? "Todo el día" : `${campaign.start} a ${campaign.end}`} />
            <Meta label="Tope" value={campaign.dailyPlays === null ? "Sin tope" : `${campaign.dailyPlays} por día`} />
            <Meta label="Peso" value={String(campaign.weight)} />
            <Meta label="Avisos" value={String(campaign.assets.length)} />
          </dl>
        </button>

        {canWrite && !ended && (
          <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
            <label htmlFor={`pause-${campaign.id}`} className="text-[13px] text-muted-foreground">
              {campaign.isActive ? "Activa" : "Pausada"}
            </label>
            <Switch id={`pause-${campaign.id}`} checked={campaign.isActive} disabled={toggling} onCheckedChange={onToggle} aria-label={`${campaign.isActive ? "Pausar" : "Reanudar"} ${campaign.name}`} />
          </div>
        )}
      </Card>
    </li>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt>{label}:</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}
