"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, ListMusic, Radio, Server, WifiOff } from "lucide-react";
import { Equalizer } from "@/components/equalizer";
import { CategoryBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { CATEGORY_COLOR, CATEGORY_LABEL } from "@/lib/categories";
import { formatClockTime, formatRelative, formatTime } from "@/lib/format";
import { describeRules, poolShares } from "@/lib/rotation-summary";
import { useSession } from "@/lib/session";
import type { OnAir, OnAirBlock, OnAirPlay } from "@/lib/types";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

const POLL_MS = 3000;

export function OnAirView() {
  const { station } = useSession();
  if (!station) {
    return (
      <>
        <PageHeader title="Aire" />
        <Card>
          <EmptyState
            icon={Radio}
            title="Todavía no hay emisoras"
            description="Cuando se cree la primera emisora de tu radio, vas a ver acá qué suena en vivo."
          />
        </Card>
      </>
    );
  }
  return <OnAirContent stationId={station.id} stationName={station.name} timezone={station.timezone} />;
}

function OnAirContent({ stationId, stationName, timezone }: { stationId: string; stationName: string; timezone: string }) {
  const query = useQuery({
    queryKey: ["on-air", stationId],
    queryFn: ({ signal }) => api<OnAir>(`/stations/${stationId}/on-air`, { signal }),
    refetchInterval: POLL_MS,
  });
  const now = useNow(1000);

  if (query.isPending) {
    return <OnAirSkeleton />;
  }
  if (query.isError && !query.data) {
    return (
      <>
        <PageHeader title="Aire" />
        <Card>
          <EmptyState
            icon={AlertTriangle}
            title="No se pudo cargar el estado del aire"
            description="Revisá tu conexión. Vamos a seguir intentando automáticamente."
            action={
              <Button variant="outline" onClick={() => query.refetch()}>
                Reintentar
              </Button>
            }
          />
        </Card>
      </>
    );
  }

  const data = query.data!;
  // El reloj del servidor manda: se corrige la diferencia con el del navegador.
  const clockOffset = Date.parse(data.now) - query.dataUpdatedAt;
  const serverNow = now === 0 ? Date.parse(data.now) : now + clockOffset;

  return (
    <>
      <PageHeader
        title="Aire"
        description={
          <>
            {stationName} · hora local {now ? formatTime(serverNow, timezone) : "--:--"}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 gap-6">
          <NowPlaying data={data} serverNow={serverNow} ready={now !== 0} />
          <div className="grid gap-6 md:grid-cols-2">
            <PlayList
              title="A continuación"
              description="Lo que el motor ya tiene elegido"
              icon={ListMusic}
              plays={data.queued}
              empty="Nada elegido todavía."
              serverNow={serverNow}
              timezone={timezone}
              mode="queued"
            />
            <PlayList
              title="Últimas emisiones"
              description="Lo que sonó antes"
              icon={Radio}
              plays={data.recent}
              empty="Todavía no hay emisiones."
              serverNow={serverNow}
              timezone={timezone}
              mode="recent"
            />
          </div>
        </div>
        <div className="grid content-start gap-6">
          <EngineCard engine={data.engine} serverNow={serverNow} stale={query.isError} />
          <BlockCard block={data.block} />
        </div>
      </div>
    </>
  );
}

function LiveBadge({ state }: { state: "live" | "idle" | "offline" }) {
  if (state === "live") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-onair/12 px-3 py-1 text-xs font-semibold tracking-widest text-onair ring-1 ring-inset ring-onair/30">
        <span className="onair-dot size-2 rounded-full bg-onair" aria-hidden />
        AL AIRE
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-semibold tracking-widest text-muted-foreground ring-1 ring-inset ring-border">
      {state === "offline" ? <WifiOff className="size-3.5" aria-hidden /> : <span className="size-2 rounded-full bg-muted-foreground/50" aria-hidden />}
      {state === "offline" ? "SIN SEÑAL" : "EN ESPERA"}
    </span>
  );
}

function NowPlaying({ data, serverNow, ready }: { data: OnAir; serverNow: number; ready: boolean }) {
  const { current } = data;
  const state = !data.engine.online ? "offline" : current ? "live" : "idle";
  const elapsed = current?.startedAt && ready ? serverNow - Date.parse(current.startedAt) : 0;

  return (
    <Card className="relative overflow-hidden">
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-20 -top-24 size-72 rounded-full blur-3xl transition-opacity duration-700",
          state === "live" ? "bg-onair/15 opacity-100" : "bg-primary/10 opacity-60",
        )}
      />
      <div className="relative grid gap-8 p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <LiveBadge state={state} />
          {current && <CategoryBadge category={current.category} />}
          {current?.advertiser && <span className="text-xs text-muted-foreground">Anunciante: {current.advertiser}</span>}
        </div>

        {current ? (
          <div className="grid gap-1.5">
            <h2 className="text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{current.title}</h2>
            <p className="text-lg text-muted-foreground">{current.artist ?? (current.category === "music" ? "Artista desconocido" : "")}</p>
          </div>
        ) : (
          <div className="grid gap-1.5">
            <h2 className="text-2xl font-semibold tracking-tight">
              {state === "offline" ? "El motor de audio no está conectado" : "Esperando la primera emisión"}
            </h2>
            <p className="max-w-md text-sm text-muted-foreground">
              {state === "offline"
                ? "Cuando el motor se conecte y empiece a emitir, vas a ver acá qué está sonando."
                : "El motor está conectado. En cuanto empiece a sonar un audio, aparece acá."}
            </p>
          </div>
        )}

        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Transcurrido</p>
            <p className="font-mono text-4xl font-medium tabular-nums tracking-tight sm:text-5xl">
              {current && ready ? formatClockTime(elapsed) : "--:--"}
            </p>
          </div>
          <Equalizer
            bars={16}
            active={state === "live"}
            className={cn("h-14 w-44 shrink-0 sm:h-16", state === "live" ? "text-primary" : "text-muted-foreground")}
          />
        </div>
      </div>
    </Card>
  );
}

function PlayList({
  title,
  description,
  icon: Icon,
  plays,
  empty,
  serverNow,
  timezone,
  mode,
}: {
  title: string;
  description: string;
  icon: typeof Radio;
  plays: OnAirPlay[];
  empty: string;
  serverNow: number;
  timezone: string;
  mode: "queued" | "recent";
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Icon className="size-4 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent>
        {plays.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ol className="grid gap-1">
            {plays.map((play, index) => (
              <li key={play.id} className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent/50">
                <span
                  className="h-8 w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: CATEGORY_COLOR[play.category] }}
                  title={CATEGORY_LABEL[play.category]}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{play.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {play.advertiser ?? play.artist ?? CATEGORY_LABEL[play.category]}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  {mode === "queued"
                    ? `#${index + 1}`
                    : play.startedAt && serverNow
                      ? formatRelative(play.startedAt, serverNow, timezone)
                      : ""}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function EngineCard({ engine, serverNow, stale }: { engine: OnAir["engine"]; serverNow: number; stale: boolean }) {
  const online = engine.online && !stale;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Motor de audio</CardTitle>
          <CardDescription>Liquidsoap en el estudio</CardDescription>
        </div>
        <Server className="size-4 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <span className={cn("size-2.5 rounded-full", online ? "bg-success shadow-[0_0_10px_var(--success)]" : "bg-destructive")} aria-hidden />
          <div>
            <p className="text-sm font-medium">{online ? "Conectado" : stale ? "Sin datos del servidor" : "Desconectado"}</p>
            <p className="text-xs text-muted-foreground">
              {engine.lastSeenAt && serverNow
                ? `Última señal ${formatRelative(engine.lastSeenAt, serverNow, "UTC")}`
                : "Nunca se conectó"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BlockCard({ block }: { block: OnAirBlock | null }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Bloque vigente</CardTitle>
          <CardDescription>{block ? `${block.start} a ${block.end}` : "Programación de ahora"}</CardDescription>
        </div>
        <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent>
        {!block ? (
          <p className="py-2 text-sm text-muted-foreground">
            No hay un bloque programado para este horario. El motor emite su biblioteca de respaldo.
          </p>
        ) : (
          <div className="grid gap-5">
            <p className="text-base font-semibold tracking-tight">{block.name}</p>

            <div className="grid gap-2.5">
              <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                {poolShares(block.rotation.pool).map((share) => (
                  <span
                    key={share.category}
                    style={{ width: `${share.percent}%`, backgroundColor: CATEGORY_COLOR[share.category] }}
                    title={`${CATEGORY_LABEL[share.category]} ${share.percent} %`}
                  />
                ))}
              </div>
              <ul className="grid gap-1.5">
                {poolShares(block.rotation.pool).map((share) => (
                  <li key={share.category} className="flex items-center gap-2 text-[13px]">
                    <span className="size-2 rounded-full" style={{ backgroundColor: CATEGORY_COLOR[share.category] }} aria-hidden />
                    <span className="flex-1">{CATEGORY_LABEL[share.category]}</span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">{share.percent} %</span>
                  </li>
                ))}
              </ul>
            </div>

            {describeRules(block.rotation).length > 0 && (
              <ul className="grid gap-1.5 border-t border-border pt-4 text-[13px] text-muted-foreground">
                {describeRules(block.rotation).map((rule) => (
                  <li key={rule} className="flex gap-2">
                    <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" aria-hidden />
                    {rule}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OnAirSkeleton() {
  return (
    <>
      <PageHeader title="Aire" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-6">
          <Skeleton className="h-72 rounded-xl" />
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </div>
        <div className="grid content-start gap-6">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    </>
  );
}
