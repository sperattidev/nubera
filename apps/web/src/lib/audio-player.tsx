"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

export interface Track {
  id: string;
  stationId: string;
  title: string;
  artist: string | null;
}

interface AudioPlayerValue {
  track: Track | null;
  playing: boolean;
  /** Segundos reproducidos y duración total (0 hasta que el navegador conoce la duración). */
  position: number;
  duration: number;
  play: (track: Track) => void;
  toggle: () => void;
  seek: (seconds: number) => void;
  close: () => void;
}

const AudioPlayerContext = createContext<AudioPlayerValue | null>(null);

export const audioUrl = (track: Pick<Track, "id" | "stationId">) =>
  `/api/stations/${track.stationId}/assets/${track.id}/audio`;

/** Un único reproductor para toda la app: escuchar un audio detiene el anterior. */
export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [track, setTrack] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audioRef.current = audio;

    const onTime = () => setPosition(audio.currentTime);
    const onMeta = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setPosition(0);
    };
    const onError = () => {
      setPlaying(false);
      toast.error("No se pudo reproducir el audio");
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("durationchange", onMeta);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.pause();
      audio.src = "";
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("durationchange", onMeta);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, []);

  const play = useCallback(
    (next: Track) => {
      const audio = audioRef.current;
      if (!audio) {
        return;
      }
      if (track?.id === next.id) {
        if (audio.paused) {
          void audio.play();
        } else {
          audio.pause();
        }
        return;
      }
      setTrack(next);
      setPosition(0);
      setDuration(0);
      audio.src = audioUrl(next);
      void audio.play().catch(() => undefined);
    },
    [track?.id],
  );

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !track) {
      return;
    }
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }, [track]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = seconds;
      setPosition(seconds);
    }
  }, []);

  const close = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setTrack(null);
    setPlaying(false);
    setPosition(0);
    setDuration(0);
  }, []);

  const value = useMemo(
    () => ({ track, playing, position, duration, play, toggle, seek, close }),
    [track, playing, position, duration, play, toggle, seek, close],
  );
  return <AudioPlayerContext.Provider value={value}>{children}</AudioPlayerContext.Provider>;
}

export function useAudioPlayer(): AudioPlayerValue {
  const value = useContext(AudioPlayerContext);
  if (!value) {
    throw new Error("useAudioPlayer debe usarse dentro de AudioPlayerProvider");
  }
  return value;
}
