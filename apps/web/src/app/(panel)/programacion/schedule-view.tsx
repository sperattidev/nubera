"use client";

import { formatClock, localTime } from "@nubera/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CalendarX2, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage } from "@/lib/api";
import { CATEGORY_COLOR, CATEGORY_LABEL } from "@/lib/categories";
import { poolShares } from "@/lib/rotation-summary";
import { coverage, DAYS, describeDays, dominantCategory, isLive, payloadWithTimes, toMinutes, type ScheduleBlock } from "@/lib/schedule";
import { useSession } from "@/lib/session";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { BlockEditor, type EditorTarget } from "./block-editor";
import { WeekGrid } from "./week-grid";

export function ScheduleView() {
  const { station } = useSession();
  if (!station) {
    return (
      <>
        <PageHeader title="Programación" />
        <Card>
          <EmptyState icon={CalendarClock} title="Todavía no hay emisoras" description="La programación se arma por emisora." />
        </Card>
      </>
    );
  }
  return <ScheduleContent stationId={station.id} timeZone={station.timezone} />;
}

function ScheduleContent({ stationId, timeZone }: { stationId: string; timeZone: string }) {
  const { allowed } = useSession();
  const canWrite = allowed("schedule:write");
  const now = useNow(30_000);
  const [editor, setEditor] = useState<EditorTarget | null>(null);

  const query = useQuery({
    queryKey: ["schedule", stationId],
    queryFn: ({ signal }) => api<{ items: ScheduleBlock[] }>(`/stations/${stationId}/schedule`, { signal }),
  });
  const blocks = useMemo(() => query.data?.items ?? [], [query.data]);
  const stats = useMemo(() => coverage(blocks), [blocks]);

  // Mover o redimensionar un bloque: la grilla se actualiza al instante y, si la API lo
  // rechaza (permiso, horario inválido, conexión), vuelve a como estaba y se avisa.
  const queryClient = useQueryClient();
  const scheduleKey = ["schedule", stationId];
  const changeTime = useMutation({
    mutationFn: ({ block, start, end }: { block: ScheduleBlock; start: number; end: number }) =>
      api<ScheduleBlock>(`/stations/${stationId}/schedule/${block.id}`, { method: "PUT", body: payloadWithTimes(block, start, end) }),
    onMutate: async ({ block, start, end }) => {
      await queryClient.cancelQueries({ queryKey: scheduleKey });
      const previous = queryClient.getQueryData<{ items: ScheduleBlock[] }>(scheduleKey);
      const clock = payloadWithTimes(block, start, end);
      queryClient.setQueryData<{ items: ScheduleBlock[] }>(scheduleKey, (old) =>
        old ? { items: old.items.map((item) => (item.id === block.id ? { ...item, start: clock.start, end: clock.end } : item)) } : old,
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      queryClient.setQueryData(scheduleKey, context?.previous);
      toast.error(errorMessage(error));
    },
    onSuccess: (_data, { block, start, end }) => {
      const clock = payloadWithTimes(block, start, end);
      toast.success(`${block.name}: ${clock.start} a ${clock.end}`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: scheduleKey });
      queryClient.invalidateQueries({ queryKey: ["on-air", stationId] });
    },
  });

  const today = now ? localTime(new Date(now), timeZone) : null;
  const startOfToday = today ? today.minute - (today.minute % 30) : 6 * 60;

  return (
    <>
      <PageHeader
        title="Programación"
        description="Qué suena y con qué reglas en cada franja de la semana."
        actions={
          canWrite && (
            <Button onClick={() => setEditor({ mode: "create", day: today?.isoDay ?? 1, minute: startOfToday })}>
              <Plus /> Nuevo bloque
            </Button>
          )
        }
      />

      {query.isPending ? (
        <Skeleton className="h-[34rem] rounded-xl" />
      ) : query.isError ? (
        <Card>
          <EmptyState
            icon={CalendarX2}
            title="No se pudo cargar la programación"
            action={
              <Button variant="outline" onClick={() => query.refetch()}>
                Reintentar
              </Button>
            }
          />
        </Card>
      ) : blocks.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarClock}
            title="Todavía no hay bloques programados"
            description="Sin bloques, el motor emite su biblioteca de respaldo. Creá el primero para definir qué suena y cuándo."
            action={
              canWrite && (
                <Button onClick={() => setEditor({ mode: "create", day: 1, minute: 6 * 60 })}>
                  <Plus /> Crear el primer bloque
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4">
          <Summary percent={stats.percent} blocks={blocks.length} />
          <div className="hidden md:block">
            <WeekGrid
              blocks={blocks}
              timeZone={timeZone}
              now={now}
              canWrite={canWrite}
              onSelect={(block) => setEditor({ mode: "edit", block })}
              onCreate={(day, minute) => setEditor({ mode: "create", day, minute })}
              onChangeTime={(block, start, end) => changeTime.mutate({ block, start, end })}
            />
          </div>
          <div className="md:hidden">
            <DayAgenda
              blocks={blocks}
              initialDay={today?.isoDay ?? 1}
              canWrite={canWrite}
              onSelect={(block) => setEditor({ mode: "edit", block })}
              onCreate={(day) => setEditor({ mode: "create", day, minute: 6 * 60 })}
            />
          </div>
          {stats.gaps.length > 0 && <Gaps gaps={stats.gaps} />}
          {canWrite && (
            <p className="hidden text-xs text-muted-foreground md:block">
              Hacé clic en un hueco para crear un bloque, o en un bloque para editarlo. Arrastralo para cambiarlo de horario y tirá de sus bordes para ajustar la duración.
              Con el teclado: Alt + ↑/↓ lo mueve y Alt + Mayús + ↑/↓ cambia su final. Esc cancela un arrastre.
            </p>
          )}
        </div>
      )}

      <BlockEditor target={editor} blocks={blocks} stationId={stationId} canWrite={canWrite} onClose={() => setEditor(null)} />
    </>
  );
}

function Summary({ percent, blocks }: { percent: number; blocks: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-muted-foreground">
      <span>
        <strong className="font-semibold text-foreground">{blocks}</strong> {blocks === 1 ? "bloque" : "bloques"}
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </span>
        <span>
          <strong className="font-semibold text-foreground">{percent} %</strong> de la semana programada
        </span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="size-3.5 rounded-sm border border-border"
          style={{ backgroundImage: "repeating-linear-gradient(135deg, transparent 0 3px, color-mix(in oklab, var(--muted-foreground) 30%, transparent) 3px 4px)" }}
          aria-hidden
        />
        Sin programar: suena la biblioteca de respaldo
      </span>
    </div>
  );
}

function Gaps({ gaps }: { gaps: { day: number; start: number; end: number }[] }) {
  const byDay = DAYS.map(({ iso, long }) => ({
    long,
    ranges: gaps.filter((gap) => gap.day === iso).map((gap) => `${formatClock(gap.start)} a ${formatClock(gap.end)}`),
  })).filter((day) => day.ranges.length > 0);

  return (
    <details className="group rounded-xl border border-border bg-card/60 px-4 py-3 text-[13px]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-medium">
        <span>Franjas sin programar</span>
        <span className="text-xs font-normal text-muted-foreground group-open:hidden">Ver</span>
      </summary>
      <ul className="mt-3 grid gap-1.5 text-muted-foreground">
        {byDay.map((day) => (
          <li key={day.long} className="flex flex-wrap gap-x-3">
            <span className="w-24 font-medium text-foreground">{day.long}</span>
            <span className="font-mono text-xs tabular-nums">{day.ranges.join(" · ")}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** En pantallas chicas la grilla no entra: se muestra un día por vez, como agenda. */
function DayAgenda({
  blocks,
  initialDay,
  canWrite,
  onSelect,
  onCreate,
}: {
  blocks: ScheduleBlock[];
  initialDay: number;
  canWrite: boolean;
  onSelect: (block: ScheduleBlock) => void;
  onCreate: (day: number) => void;
}) {
  const [day, setDay] = useState(initialDay);
  const items = blocks.filter((block) => block.days.includes(day)).sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-7 gap-1" role="group" aria-label="Día de la semana">
        {DAYS.map(({ iso, short, long }) => (
          <button
            key={iso}
            type="button"
            aria-pressed={day === iso}
            aria-label={long}
            onClick={() => setDay(iso)}
            className={cn(
              "rounded-lg border py-2 text-[12px] font-medium transition-colors",
              day === iso ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card/60 text-muted-foreground",
            )}
          >
            {short}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">Sin bloques este día.</p>
      ) : (
        <ul className="grid gap-2.5">
          {items.map((block) => {
            const live = isLive(block);
            const color = live ? "var(--onair)" : CATEGORY_COLOR[dominantCategory(block.rotation)];
            return (
              <li key={block.id}>
                <button
                  type="button"
                  onClick={() => onSelect(block)}
                  style={{ "--c": color } as React.CSSProperties}
                  className="relative grid w-full gap-2 overflow-hidden rounded-xl border border-(--c)/35 bg-linear-to-b from-(--c)/15 to-(--c)/5 px-4 py-3 text-left"
                >
                  <span className="absolute inset-y-0 left-0 w-1 bg-(--c)" aria-hidden />
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">{block.name}</span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {block.start}–{block.end}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">{describeDays(block.days)}</span>
                  {live ? (
                    <span className="text-xs font-medium text-(--c)">Programa en vivo</span>
                  ) : (
                  <span className="flex h-1.5 overflow-hidden rounded-full bg-background/40" aria-hidden>
                    {poolShares(block.rotation.pool).map((share) => (
                      <span key={share.category} title={CATEGORY_LABEL[share.category]} style={{ width: `${share.percent}%`, backgroundColor: CATEGORY_COLOR[share.category] }} />
                    ))}
                  </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {canWrite && (
        <Button variant="outline" onClick={() => onCreate(day)}>
          <Plus /> Agregar bloque el {DAYS[day - 1]!.long.toLowerCase()}
        </Button>
      )}
    </div>
  );
}
