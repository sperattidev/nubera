"use client";

import { localTime } from "@nubera/core";
import { useEffect, useRef } from "react";
import { CATEGORY_COLOR } from "@/lib/categories";
import { poolShares } from "@/lib/rotation-summary";
import {
  DAYS,
  describeDays,
  dominantCategory,
  layoutDay,
  MINUTES_PER_DAY,
  type Placed,
  type ScheduleBlock,
} from "@/lib/schedule";
import { cn } from "@/lib/utils";

const HOUR_HEIGHT = 48;
const SNAP_MINUTES = 30;
const GRID_HEIGHT = HOUR_HEIGHT * 24;
const minutesToPx = (minutes: number) => (minutes / 60) * HOUR_HEIGHT;

/** Rayado suave para las franjas sin programar: ahí el motor emite su biblioteca de respaldo. */
const UNSCHEDULED_PATTERN =
  "repeating-linear-gradient(135deg, transparent 0 7px, color-mix(in oklab, var(--muted-foreground) 9%, transparent) 7px 8px)";

export function WeekGrid({
  blocks,
  timeZone,
  now,
  canWrite,
  onSelect,
  onCreate,
}: {
  blocks: ScheduleBlock[];
  timeZone: string;
  /** Milisegundos desde epoch; 0 hasta que el reloj del navegador está listo. */
  now: number;
  canWrite: boolean;
  onSelect: (block: ScheduleBlock) => void;
  onCreate: (isoDay: number, startMinute: number) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const current = now ? localTime(new Date(now), timeZone) : null;

  // Al abrir, la grilla se centra en la hora actual (o en las 06:00 si todavía no hay reloj).
  useEffect(() => {
    const target = current ? current.minute : 6 * 60;
    scroller.current?.scrollTo({ top: Math.max(minutesToPx(target) - 160, 0) });
  }, []); // Solo al montar: seguir al reloj movería la grilla mientras se la está usando.

  return (
    <div
      ref={scroller}
      className="relative max-h-[calc(100dvh-14rem)] min-h-[28rem] overflow-auto rounded-xl border border-border bg-card"
      role="grid"
      aria-label="Programación semanal"
    >
      <div className="grid min-w-[56rem] grid-cols-[3.25rem_repeat(7,minmax(0,1fr))]">
        {/* Encabezado fijo con los días */}
        <div className="sticky top-0 z-20 border-b border-border bg-card" />
        {DAYS.map(({ iso, short }) => {
          const today = current?.isoDay === iso;
          return (
            <div
              key={iso}
              role="columnheader"
              className="sticky top-0 z-20 flex items-center justify-center gap-2 border-b border-l border-border bg-card py-2.5 text-[13px] font-medium"
            >
              <span className={cn(today ? "text-primary" : "text-muted-foreground")}>{short}</span>
              {today && <span className="size-1.5 rounded-full bg-primary" aria-label="Hoy" />}
            </div>
          );
        })}

        {/* Horas */}
        <div className="relative" style={{ height: GRID_HEIGHT }} aria-hidden>
          {Array.from({ length: 24 }, (_, hour) => (
            <span
              key={hour}
              className="absolute right-2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-muted-foreground"
              style={{ top: hour * HOUR_HEIGHT, display: hour === 0 ? "none" : undefined }}
            >
              {String(hour).padStart(2, "0")}:00
            </span>
          ))}
        </div>

        {/* Columnas */}
        {DAYS.map(({ iso, long }) => (
          <DayColumn
            key={iso}
            isoDay={iso}
            label={long}
            placed={layoutDay(blocks, iso)}
            nowMinute={current?.isoDay === iso ? current.minute : null}
            canWrite={canWrite}
            onSelect={onSelect}
            onCreate={onCreate}
          />
        ))}
      </div>
    </div>
  );
}

function DayColumn({
  isoDay,
  label,
  placed,
  nowMinute,
  canWrite,
  onSelect,
  onCreate,
}: {
  isoDay: number;
  label: string;
  placed: Placed[];
  nowMinute: number | null;
  canWrite: boolean;
  onSelect: (block: ScheduleBlock) => void;
  onCreate: (isoDay: number, startMinute: number) => void;
}) {
  return (
    <div
      role="gridcell"
      aria-label={label}
      className={cn("relative border-l border-border", canWrite && "cursor-copy")}
      style={{ height: GRID_HEIGHT, backgroundImage: UNSCHEDULED_PATTERN }}
      onClick={(event) => {
        // Un clic en un hueco crea un bloque que arranca en esa hora (redondeada a 30 min).
        if (!canWrite || event.target !== event.currentTarget) return;
        const y = event.clientY - event.currentTarget.getBoundingClientRect().top;
        const minute = Math.floor(((y / HOUR_HEIGHT) * 60) / SNAP_MINUTES) * SNAP_MINUTES;
        onCreate(isoDay, Math.min(minute, MINUTES_PER_DAY - SNAP_MINUTES));
      }}
    >
      {/* Líneas de cada hora */}
      {Array.from({ length: 23 }, (_, index) => (
        <div
          key={index}
          aria-hidden
          className="pointer-events-none absolute inset-x-0 border-t border-border/70"
          style={{ top: (index + 1) * HOUR_HEIGHT }}
        />
      ))}

      {placed.map((item, order) => (
        <BlockCard key={item.block.id} item={item} order={order} onSelect={onSelect} />
      ))}

      {nowMinute !== null && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 z-[15] flex items-center"
          style={{ top: minutesToPx(nowMinute) }}
        >
          <span className="-ml-1 size-2 rounded-full bg-onair" />
          <span className="h-px flex-1 bg-onair" />
        </div>
      )}
    </div>
  );
}

/** Cuánto se corre hacia la derecha cada bloque apilado, y cuántos niveles se distinguen. */
const STACK_INSET_PX = 12;
const MAX_STACK = 4;

function BlockCard({ item, order, onSelect }: { item: Placed; order: number; onSelect: (block: ScheduleBlock) => void }) {
  const { block, start, end, depth } = item;
  const inset = Math.min(depth, MAX_STACK) * STACK_INSET_PX;
  const color = CATEGORY_COLOR[dominantCategory(block.rotation)];
  const height = minutesToPx(end - start);
  const compact = height < 56;
  const shares = poolShares(block.rotation.pool);

  return (
    <button
      type="button"
      onClick={() => onSelect(block)}
      title={`${block.name} · ${describeDays(block.days)} · ${block.start} a ${block.end}`}
      style={
        {
          "--c": color,
          top: minutesToPx(start) + 1,
          height: Math.max(height - 2, 20),
          left: inset + 2,
          right: 2,
          // El que se dibuja después queda encima; el reloj de "ahora" siempre por encima de todos.
          zIndex: Math.min(order + 1, 9),
        } as React.CSSProperties
      }
      className="absolute flex flex-col gap-0.5 overflow-hidden rounded-md border border-(--c)/40 bg-card bg-linear-to-b from-(--c)/20 to-(--c)/10 px-2 py-1.5 text-left shadow-[0_2px_8px_-2px_rgb(0_0_0/0.35)] transition-[filter] hover:brightness-110"
    >
      <span className="absolute inset-y-0 left-0 w-1 bg-(--c)" aria-hidden />
      <span className="truncate pl-1 text-[12px] font-semibold leading-tight">{block.name}</span>
      {!compact && (
        <span className="truncate pl-1 font-mono text-[11px] tabular-nums text-muted-foreground">
          {block.start}–{block.end}
        </span>
      )}
      {height >= 84 && (
        <span className="mt-auto flex h-1.5 overflow-hidden rounded-full bg-background/40" aria-hidden>
          {shares.map((share) => (
            <span key={share.category} style={{ width: `${share.percent}%`, backgroundColor: CATEGORY_COLOR[share.category] }} />
          ))}
        </span>
      )}
    </button>
  );
}
