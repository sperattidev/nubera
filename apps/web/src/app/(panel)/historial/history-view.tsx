"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { History, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { CategoryBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { ASSET_CATEGORIES, CATEGORY_COLOR, CATEGORY_LABEL } from "@/lib/categories";
import { formatDateTime, formatTime } from "@/lib/format";
import { historyRange, RANGES, type RangeId } from "@/lib/history-range";
import { useSession } from "@/lib/session";
import type { PlayLogEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

const LIMIT = 500;

export function HistoryView() {
  const { station } = useSession();
  if (!station) {
    return (
      <>
        <PageHeader title="Historial" />
        <Card>
          <EmptyState icon={History} title="Todavía no hay emisoras" description="El historial es de cada emisora." />
        </Card>
      </>
    );
  }
  return <HistoryContent stationId={station.id} timezone={station.timezone} />;
}

function HistoryContent({ stationId, timezone }: { stationId: string; timezone: string }) {
  const [rangeId, setRangeId] = useState<RangeId>("today");
  // El período se fija al elegirlo: recalcularlo en cada render cambiaría la consulta sin parar.
  const range = useMemo(() => historyRange(rangeId, new Date(), timezone), [rangeId, timezone]);

  const query = useQuery({
    queryKey: ["plays", stationId, rangeId, range.from.toISOString()],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ from: range.from.toISOString(), limit: String(LIMIT) });
      if (range.to) params.set("to", range.to.toISOString());
      return api<{ items: PlayLogEntry[] }>(`/stations/${stationId}/plays?${params}`, { signal });
    },
    placeholderData: keepPreviousData,
    refetchInterval: rangeId === "today" ? 15_000 : false,
  });

  const items = query.data?.items ?? [];
  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const item of items) {
      result.set(item.category, (result.get(item.category) ?? 0) + 1);
    }
    return result;
  }, [items]);
  const multiDay = rangeId !== "today" && rangeId !== "yesterday";

  return (
    <>
      <PageHeader
        title="Historial"
        description="Todo lo que efectivamente salió al aire, confirmado por el motor de audio."
        actions={
          <div className="flex rounded-lg border border-border bg-card/60 p-0.5" role="group" aria-label="Período">
            {RANGES.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                aria-pressed={rangeId === id}
                onClick={() => setRangeId(id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
                  rangeId === id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      {items.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Emisiones" value={items.length} />
          {ASSET_CATEGORIES.filter((category) => counts.has(category)).map((category) => (
            <Stat key={category} label={CATEGORY_LABEL[category]} value={counts.get(category)!} color={CATEGORY_COLOR[category]} />
          ))}
        </div>
      )}

      <Card className="overflow-hidden">
        {query.isPending ? (
          <div className="divide-y divide-border" aria-busy>
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="flex items-center gap-4 px-4 py-3.5">
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="ml-auto h-5 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : query.isError && !query.data ? (
          <EmptyState
            icon={SearchX}
            title="No se pudo cargar el historial"
            action={
              <Button variant="outline" onClick={() => query.refetch()}>
                Reintentar
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState icon={History} title="Sin emisiones en este período" description="Cuando el motor emita audios, van a aparecer acá." />
        ) : (
          <div className={cn("overflow-x-auto transition-opacity", query.isPlaceholderData && "opacity-60")}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-medium">{multiDay ? "Fecha y hora" : "Hora"}</th>
                  <th className="px-3 py-3 font-medium">Título</th>
                  <th className="hidden px-3 py-3 font-medium md:table-cell">Artista</th>
                  <th className="px-3 py-3 font-medium">Categoría</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-accent/40">
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[13px] tabular-nums text-muted-foreground">
                      {multiDay ? formatDateTime(item.startedAt, timezone) : formatTime(item.startedAt, timezone)}
                    </td>
                    <td className="max-w-0 px-3 py-2.5">
                      <p className="truncate font-medium">{item.title}</p>
                      <p className="truncate text-[13px] text-muted-foreground md:hidden">{item.artist ?? ""}</p>
                    </td>
                    <td className="hidden px-3 py-2.5 text-muted-foreground md:table-cell">{item.artist ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <CategoryBadge category={item.category} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {items.length >= LIMIT && (
          <p className="border-t border-border px-4 py-3 text-[13px] text-muted-foreground">
            Se muestran las últimas {LIMIT} emisiones del período.
          </p>
        )}
      </Card>
    </>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <Card className="px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {color && <span className="size-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />}
        {label}
      </p>
      <p className="mt-0.5 font-mono text-2xl font-medium tabular-nums">{value.toLocaleString("es-AR")}</p>
    </Card>
  );
}
