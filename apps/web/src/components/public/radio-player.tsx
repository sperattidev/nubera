"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useEffect } from "react";
import { Equalizer } from "@/components/equalizer";
import { LogoMark } from "@/components/shell/logo";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { trackLabel, type PublicStation } from "@/lib/public-player";
import { useNow } from "@/lib/use-now";
import { useRadioStream, type StreamStatus } from "@/lib/use-radio-stream";
import { cn } from "@/lib/utils";

const POLL_MS = 10_000;

const STATUS_TEXT: Record<StreamStatus, string> = {
  idle: "Tocá para escuchar",
  connecting: "Conectando…",
  playing: "En vivo",
  reconnecting: "Reconectando…",
  error: "No se pudo conectar",
};

/** Reproductor de una emisora: la página pública (`page`) y la versión para incrustar (`embed`). */
export function RadioPlayer({ initial, variant }: { initial: PublicStation; variant: "page" | "embed" }) {
  const query = useQuery({
    queryKey: ["public-station", initial.slug],
    queryFn: ({ signal }) => fetchStation(initial.slug, signal),
    initialData: initial,
    refetchInterval: POLL_MS,
    // Si falla una consulta se sigue mostrando lo último que se supo.
    retry: false,
  });
  const station = query.data;
  const stream = useRadioStream(station.streamUrl);
  const label = trackLabel(station.nowPlaying, station.name);
  const active = stream.status !== "idle" && stream.status !== "error";
  const busy = stream.status === "connecting" || stream.status === "reconnecting";

  useMediaSession(station, label, stream.status, stream.play, stream.stop);

  const button = (
    <Button
      type="button"
      onClick={stream.toggle}
      disabled={!stream.available}
      aria-label={active ? "Pausar" : stream.status === "error" ? "Reintentar" : "Reproducir"}
      className={cn("shrink-0 rounded-full", variant === "page" ? "size-20 [&_svg]:size-8" : "size-14 [&_svg]:size-6")}
    >
      {busy ? <Loader2 className="animate-spin" /> : active ? <Pause /> : stream.status === "error" ? <RotateCcw /> : <Play className="translate-x-0.5" />}
    </Button>
  );

  const text = (
    <div className="min-w-0" aria-live="polite">
      <p className={cn("truncate font-semibold tracking-tight", variant === "page" ? "text-xl" : "text-base")}>{label.title}</p>
      <p className="truncate text-sm text-muted-foreground">{label.subtitle}</p>
    </div>
  );

  if (variant === "embed") {
    return (
      <div className="flex min-h-dvh items-center gap-4 px-4">
        {button}
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <LiveDot status={stream.status} />
            <span className="truncate">{station.name}</span>
          </div>
          {text}
          {!stream.available && <p className="text-xs text-muted-foreground">La transmisión no está disponible por ahora.</p>}
        </div>
        <Equalizer bars={5} active={stream.status === "playing"} className="h-8 w-8 shrink-0 text-primary" />
      </div>
    );
  }

  return (
    <main className="relative grid min-h-dvh place-items-center px-4 py-12">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="grid w-full max-w-md gap-6">
        <header className="grid justify-items-center gap-3 text-center">
          <LogoMark className="size-11 rounded-2xl" />
          <h1 className="text-2xl font-semibold tracking-tight">{station.name}</h1>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LiveDot status={stream.status} />
            {STATUS_TEXT[stream.status]}
          </p>
        </header>

        <section className="grid gap-6 rounded-2xl border border-border bg-card p-6 shadow-[0_1px_0_0_rgb(255_255_255/0.03)_inset,0_18px_48px_-24px_rgb(0_0_0/0.55)]">
          <Equalizer bars={16} active={stream.status === "playing"} className="h-16 w-full text-primary" />
          <div className="flex items-center gap-5">
            {button}
            {text}
          </div>

          {stream.available ? (
            <label className="flex items-center gap-3 text-muted-foreground">
              <button
                type="button"
                onClick={() => stream.setVolume(stream.volume > 0 ? 0 : 1)}
                className="rounded-md p-1 transition-colors hover:text-foreground"
                aria-label={stream.volume > 0 ? "Silenciar" : "Quitar el silencio"}
              >
                {stream.volume > 0 ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
              </button>
              <span className="sr-only">Volumen</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={stream.volume}
                onChange={(event) => stream.setVolume(Number(event.target.value))}
                className="h-1.5 flex-1 cursor-pointer accent-primary"
              />
            </label>
          ) : (
            <p className="text-center text-sm text-muted-foreground">La transmisión no está disponible por ahora. Probá de nuevo en un rato.</p>
          )}

          {stream.status === "error" && <p className="text-center text-sm text-destructive">Se cortó la conexión. Tocá el botón para reintentar.</p>}
        </section>

        {station.recent.length > 0 && <RecentList station={station} />}

        <footer className="text-center text-xs text-muted-foreground">Con tecnología de Nubera</footer>
      </div>
    </main>
  );
}

function RecentList({ station }: { station: PublicStation }) {
  const now = useNow(30_000);
  return (
    <section aria-label="Sonó antes">
      <h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Sonó antes</h2>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {station.recent.map((track) => (
          <li key={`${track.startedAt}-${track.title}`} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{track.title}</p>
              {track.artist && <p className="truncate text-[13px] text-muted-foreground">{track.artist}</p>}
            </div>
            {now > 0 && <span className="shrink-0 text-xs text-muted-foreground">{formatRelative(track.startedAt, now, "UTC")}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function LiveDot({ status }: { status: StreamStatus }) {
  const live = status === "playing";
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", live ? "onair-dot bg-onair" : "bg-muted-foreground/50")} aria-hidden />;
}

async function fetchStation(slug: string, signal: AbortSignal): Promise<PublicStation> {
  return api<PublicStation>(`/public/stations/${encodeURIComponent(slug)}`, { signal });
}

/** Controles y datos del tema en la pantalla de bloqueo y en las teclas multimedia. */
function useMediaSession(
  station: PublicStation,
  label: { title: string; subtitle: string },
  status: StreamStatus,
  play: () => void,
  stop: () => void,
) {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator) || status === "idle") return;
    const session = navigator.mediaSession;
    session.metadata = new MediaMetadata({ title: label.title, artist: label.subtitle, album: station.name });
    session.playbackState = status === "playing" ? "playing" : "paused";
    session.setActionHandler("play", play);
    session.setActionHandler("pause", stop);
    session.setActionHandler("stop", stop);
    return () => {
      session.setActionHandler("play", null);
      session.setActionHandler("pause", null);
      session.setActionHandler("stop", null);
    };
  }, [label.title, label.subtitle, station.name, status, play, stop]);
}
