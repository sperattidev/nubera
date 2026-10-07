"use client";

import { formatClock, localTime } from "@nubera/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { CATEGORY_COLOR } from "@/lib/categories";
import { poolShares } from "@/lib/rotation-summary";
import {
  applyDrag,
  DAYS,
  describeDays,
  dominantCategory,
  isLive,
  layoutDay,
  MINUTES_PER_DAY,
  nudge,
  toMinutes,
  type DragMode,
  type Placed,
  type ScheduleBlock,
} from "@/lib/schedule";
import { cn } from "@/lib/utils";

const HOUR_HEIGHT = 48;
const SNAP_MINUTES = 30;
const GRID_HEIGHT = HOUR_HEIGHT * 24;
const minutesToPx = (minutes: number) => (minutes / 60) * HOUR_HEIGHT;

/** Cuánto se corre hacia la derecha cada bloque apilado, y cuántos niveles se distinguen. */
const STACK_INSET_PX = 16;
const MAX_STACK = 4;

/** Movimiento mínimo (px) para que un clic se considere arrastre. */
const DRAG_THRESHOLD_PX = 4;

/** Rayado suave para las franjas sin programar: ahí el motor emite su biblioteca de respaldo. */
const UNSCHEDULED_PATTERN =
  "repeating-linear-gradient(135deg, transparent 0 7px, color-mix(in oklab, var(--muted-foreground) 9%, transparent) 7px 8px)";

interface Drag {
  blockId: string;
  mode: DragMode;
  origin: { start: number; end: number };
  startY: number;
  /** Horario actual durante el arrastre. */
  start: number;
  end: number;
  moved: boolean;
}

export function WeekGrid({
  blocks,
  timeZone,
  now,
  canWrite,
  onSelect,
  onCreate,
  onChangeTime,
}: {
  blocks: ScheduleBlock[];
  timeZone: string;
  /** Milisegundos desde epoch; 0 hasta que el reloj del navegador está listo. */
  now: number;
  canWrite: boolean;
  onSelect: (block: ScheduleBlock) => void;
  onCreate: (isoDay: number, startMinute: number) => void;
  /** Se llama al soltar un bloque movido o redimensionado, con el horario nuevo en minutos. */
  onChangeTime: (block: ScheduleBlock, start: number, end: number) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const current = now ? localTime(new Date(now), timeZone) : null;
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;

  // Al abrir, la grilla se centra en la hora actual (o en las 06:00 si todavía no hay reloj).
  useEffect(() => {
    const target = current ? current.minute : 6 * 60;
    scroller.current?.scrollTo({ top: Math.max(minutesToPx(target) - 160, 0) });
  }, []); // Solo al montar: seguir al reloj movería la grilla mientras se la está usando.

  // Durante un arrastre, los bloques se dibujan con el horario provisorio.
  const shown = useMemo(
    () =>
      drag
        ? blocks.map((block) => (block.id === drag.blockId ? { ...block, start: formatClock(drag.start), end: formatClock(drag.end) } : block))
        : blocks,
    [blocks, drag],
  );

  /** Devuelve true si el puntero inició un arrastre (entonces el clic lo resuelve el arrastre). */
  const beginDrag = useCallback(
    (event: React.PointerEvent, block: ScheduleBlock, mode: DragMode): boolean => {
      // Con el dedo se toca para editar: arrastrar taparía el desplazamiento de la pantalla.
      if (!canWrite || event.button !== 0 || event.pointerType === "touch") return false;
      event.preventDefault();
      event.stopPropagation();
      const origin = { start: toMinutes(block.start), end: toMinutes(block.end) };
      const state: Drag = { blockId: block.id, mode, origin, startY: event.clientY, ...origin, moved: false };
      dragRef.current = state;
      setDrag(state);
      return true;
    },
    [canWrite],
  );

  useEffect(() => {
    if (!drag) return;

    const move = (event: PointerEvent) => {
      const state = dragRef.current;
      if (!state) return;
      const dy = event.clientY - state.startY;
      if (!state.moved && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
      const next = applyDrag(state.mode, state.origin, (dy / HOUR_HEIGHT) * 60);
      const updated: Drag = { ...state, ...next, moved: true };
      // Se actualiza la referencia ya mismo: soltar puede llegar antes de que React vuelva a dibujar.
      dragRef.current = updated;
      setDrag(updated);
    };

    const finish = (commit: boolean) => {
      const state = dragRef.current;
      setDrag(null);
      if (!state) return;
      const block = blocks.find((item) => item.id === state.blockId);
      if (!block || !commit) return;
      if (!state.moved) {
        onSelect(block);
      } else if (state.start !== state.origin.start || state.end !== state.origin.end) {
        onChangeTime(block, state.start, state.end);
      }
    };

    const up = () => finish(true);
    const key = (event: KeyboardEvent) => event.key === "Escape" && finish(false);
    const cancel = () => finish(false);

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
    };
  }, [drag === null, blocks, onSelect, onChangeTime]); // El estado en curso se lee desde dragRef, no de las dependencias.

  return (
    <div
      ref={scroller}
      className={cn(
        "relative max-h-[calc(100dvh-14rem)] min-h-[28rem] overflow-auto rounded-xl border border-border bg-card",
        drag?.moved && "cursor-grabbing select-none",
      )}
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
            placed={layoutDay(shown, iso)}
            blocks={blocks}
            dragId={drag?.moved ? drag.blockId : null}
            nowMinute={current?.isoDay === iso ? current.minute : null}
            canWrite={canWrite}
            onSelect={onSelect}
            onCreate={onCreate}
            onChangeTime={onChangeTime}
            beginDrag={beginDrag}
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
  blocks,
  dragId,
  nowMinute,
  canWrite,
  onSelect,
  onCreate,
  onChangeTime,
  beginDrag,
}: {
  isoDay: number;
  label: string;
  placed: Placed[];
  blocks: ScheduleBlock[];
  dragId: string | null;
  nowMinute: number | null;
  canWrite: boolean;
  onSelect: (block: ScheduleBlock) => void;
  onCreate: (isoDay: number, startMinute: number) => void;
  onChangeTime: (block: ScheduleBlock, start: number, end: number) => void;
  beginDrag: (event: React.PointerEvent, block: ScheduleBlock, mode: DragMode) => boolean;
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
        <BlockCard
          key={item.block.id}
          item={item}
          order={order}
          original={blocks.find((block) => block.id === item.block.id) ?? item.block}
          dragging={dragId === item.block.id}
          canWrite={canWrite}
          onSelect={onSelect}
          onChangeTime={onChangeTime}
          beginDrag={beginDrag}
        />
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

function BlockCard({
  item,
  order,
  original,
  dragging,
  canWrite,
  onSelect,
  onChangeTime,
  beginDrag,
}: {
  item: Placed;
  order: number;
  /** El bloque tal como está guardado (el de `item` puede traer el horario provisorio de un arrastre). */
  original: ScheduleBlock;
  dragging: boolean;
  canWrite: boolean;
  onSelect: (block: ScheduleBlock) => void;
  onChangeTime: (block: ScheduleBlock, start: number, end: number) => void;
  beginDrag: (event: React.PointerEvent, block: ScheduleBlock, mode: DragMode) => boolean;
}) {
  const { block, start, end, depth, coveredTop } = item;
  // Si el arrastre se hizo cargo del puntero, el clic que sigue no debe abrir el editor por segunda vez.
  const handledByDrag = useRef(false);
  const inset = Math.min(depth, MAX_STACK) * STACK_INSET_PX;
  const live = isLive(block);
  const color = live ? "var(--onair)" : CATEGORY_COLOR[dominantCategory(block.rotation)];
  const height = minutesToPx(end - start);
  const compact = height < 56 && !dragging;
  const shares = live ? [] : poolShares(block.rotation.pool);

  function onKeyDown(event: React.KeyboardEvent) {
    if (!canWrite || !event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    const next = nudge({ start: toMinutes(original.start), end: toMinutes(original.end) }, event.key === "ArrowUp" ? "up" : "down", event.shiftKey);
    if (next.start !== toMinutes(original.start) || next.end !== toMinutes(original.end)) {
      onChangeTime(original, next.start, next.end);
    }
  }

  return (
    <div
      style={
        {
          "--c": color,
          top: minutesToPx(start) + 1,
          height: Math.max(height - 2, 20),
          left: inset + 2,
          right: 2,
          // El que se dibuja después queda encima; el reloj de "ahora" siempre por encima de todos.
          zIndex: dragging ? 14 : Math.min(order + 1, 9),
        } as React.CSSProperties
      }
      className={cn("group absolute", dragging && "opacity-90")}
    >
      <button
        type="button"
        onPointerDown={(event) => {
          handledByDrag.current = beginDrag(event, original, "move");
        }}
        onClick={() => {
          // Teclado, dedo y usuarios de solo lectura llegan acá; con el mouse, el arrastre ya decidió.
          if (handledByDrag.current) {
            handledByDrag.current = false;
            return;
          }
          onSelect(original);
        }}
        onKeyDown={onKeyDown}
        title={`${block.name} · ${describeDays(block.days)} · ${block.start} a ${block.end}${canWrite ? " · Arrastrá para mover; Alt + ↑/↓ con el teclado" : ""}`}
        aria-keyshortcuts={canWrite ? "Alt+ArrowUp Alt+ArrowDown Alt+Shift+ArrowUp Alt+Shift+ArrowDown" : undefined}
        className={cn(
          "relative flex size-full touch-manipulation flex-col gap-0.5 overflow-hidden rounded-md border border-(--c)/40 bg-card bg-linear-to-b from-(--c)/20 to-(--c)/10 py-1.5 pr-2 text-left shadow-[0_2px_8px_-2px_rgb(0_0_0/0.35)] transition-[filter,box-shadow] hover:brightness-110",
          coveredTop ? "pl-6" : "pl-3",
          canWrite && (dragging ? "cursor-grabbing shadow-xl ring-2 ring-primary" : "cursor-grab"),
        )}
      >
        <span className="absolute inset-y-0 left-0 w-1 bg-(--c)" aria-hidden />

        {/* Si otro bloque tapa el título, el nombre se lee en la franja izquierda, que siempre queda a la vista. */}
        {coveredTop && (
          <span
            className="absolute inset-y-1.5 left-1.5 flex w-4 items-start justify-center overflow-hidden text-[10px] font-semibold leading-none text-foreground/80 [writing-mode:vertical-rl]"
            aria-hidden
          >
            <span className="max-h-full truncate">{block.name}</span>
          </span>
        )}

        <span className="flex items-center gap-1 truncate text-[12px] font-semibold leading-tight">
          {live && <Mic className="size-3 shrink-0 text-(--c)" aria-label="Programa en vivo" />}
          <span className="truncate">{block.name}</span>
        </span>
        {!compact && (
          <span className="truncate font-mono text-[11px] tabular-nums text-muted-foreground">
            {block.start}–{block.end}
          </span>
        )}
        {height >= 84 && shares.length > 0 && (
          <span className="mt-auto flex h-1.5 overflow-hidden rounded-full bg-background/40" aria-hidden>
            {shares.map((share) => (
              <span key={share.category} style={{ width: `${share.percent}%`, backgroundColor: CATEGORY_COLOR[share.category] }} />
            ))}
          </span>
        )}
      </button>

      {/* Manijas para cambiar el inicio y el final */}
      {canWrite && (
        <>
          <span
            onPointerDown={(event) => beginDrag(event, original, "resize-start")}
            className="absolute inset-x-1 top-0 z-10 h-2 cursor-ns-resize rounded-t-md opacity-0 transition-opacity after:absolute after:inset-x-1/4 after:top-0.5 after:h-0.5 after:rounded-full after:bg-(--c) group-hover:opacity-100"
            aria-hidden
          />
          <span
            onPointerDown={(event) => beginDrag(event, original, "resize-end")}
            className="absolute inset-x-1 bottom-0 z-10 h-2 cursor-ns-resize rounded-b-md opacity-0 transition-opacity after:absolute after:inset-x-1/4 after:bottom-0.5 after:h-0.5 after:rounded-full after:bg-(--c) group-hover:opacity-100"
            aria-hidden
          />
        </>
      )}
    </div>
  );
}
