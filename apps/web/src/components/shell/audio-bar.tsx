"use client";

import { Pause, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAudioPlayer } from "@/lib/audio-player";
import { formatClockTime } from "@/lib/format";

/** Barra inferior con el audio que se está escuchando desde la biblioteca. */
export function AudioBar() {
  const { track, playing, position, duration, toggle, seek, close } = useAudioPlayer();
  if (!track) {
    return null;
  }

  const progress = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <div
      role="region"
      aria-label="Reproductor"
      className="popover print:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/90 backdrop-blur-xl lg:left-64"
      data-state="open"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6 lg:px-8">
        <Button size="icon" onClick={toggle} aria-label={playing ? "Pausar" : "Reproducir"}>
          {playing ? <Pause /> : <Play />}
        </Button>
        <div className="min-w-0 flex-1 sm:flex-none sm:basis-64">
          <p className="truncate text-sm font-medium">{track.title}</p>
          <p className="truncate text-xs text-muted-foreground">{track.artist ?? "Sin artista"}</p>
        </div>
        <span className="hidden w-10 text-right font-mono text-xs tabular-nums text-muted-foreground sm:block">
          {formatClockTime(position * 1000)}
        </span>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={Math.min(position, duration || 1)}
          onChange={(event) => seek(Number(event.target.value))}
          disabled={duration === 0}
          aria-label="Posición"
          className="hidden h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary sm:block"
          style={{
            background: `linear-gradient(to right, var(--primary) ${progress}%, var(--muted) ${progress}%)`,
          }}
        />
        <span className="hidden w-10 font-mono text-xs tabular-nums text-muted-foreground sm:block">
          {duration > 0 ? formatClockTime(duration * 1000) : "--:--"}
        </span>
        <Button variant="ghost" size="icon" onClick={close} aria-label="Cerrar reproductor">
          <X />
        </Button>
      </div>
    </div>
  );
}
