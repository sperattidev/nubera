"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_RETRIES, retryDelayMs, streamSrc } from "./public-player";

export type StreamStatus = "idle" | "connecting" | "playing" | "reconnecting" | "error";

/** Si el audio se queda sin datos más que esto, se reconecta. */
const STALL_LIMIT_MS = 12_000;
const VOLUME_KEY = "nubera-radio-volume";

/**
 * Reproduce el flujo en vivo con reconexión automática (con datos móviles se corta seguido).
 * El audio solo arranca por una acción de la persona, como exigen los navegadores.
 */
export function useRadioStream(streamUrl: string | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wantedRef = useRef(false);
  const attemptRef = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRef = useRef<() => void>(() => {});
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [volume, setVolumeState] = useState(1);

  const clearTimers = useCallback(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    if (stallTimer.current) clearTimeout(stallTimer.current);
    retryTimer.current = null;
    stallTimer.current = null;
  }, []);

  const release = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
  }, []);

  const stop = useCallback(() => {
    wantedRef.current = false;
    attemptRef.current = 0;
    clearTimers();
    release();
    setStatus("idle");
  }, [clearTimers, release]);

  const fail = useCallback(() => {
    if (!wantedRef.current) return;
    clearTimers();
    if (attemptRef.current >= MAX_RETRIES) {
      wantedRef.current = false;
      release();
      setStatus("error");
      return;
    }
    const delay = retryDelayMs(attemptRef.current);
    attemptRef.current += 1;
    setStatus("reconnecting");
    retryTimer.current = setTimeout(() => connectRef.current(), delay);
  }, [clearTimers, release]);

  const connect = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !streamUrl || !wantedRef.current) return;
    clearTimers();
    audio.src = streamSrc(streamUrl, Date.now());
    audio.play().catch((error: unknown) => {
      // Una carga nueva interrumpe la anterior: no es un fallo.
      if (error instanceof DOMException && error.name === "AbortError") return;
      fail();
    });
    // Si no llegan datos a tiempo, se reintenta.
    stallTimer.current = setTimeout(fail, STALL_LIMIT_MS);
  }, [clearTimers, fail, streamUrl]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "none";
    audioRef.current = audio;
    try {
      const saved = Number(localStorage.getItem(VOLUME_KEY));
      if (localStorage.getItem(VOLUME_KEY) !== null && saved >= 0 && saved <= 1) {
        audio.volume = saved;
        setVolumeState(saved);
      }
    } catch {
      // Sin almacenamiento: se usa el volumen por defecto.
    }

    const onPlaying = () => {
      if (stallTimer.current) clearTimeout(stallTimer.current);
      stallTimer.current = null;
      attemptRef.current = 0;
      setStatus("playing");
    };
    const onWaiting = () => {
      if (!wantedRef.current) return;
      setStatus("connecting");
      if (stallTimer.current) clearTimeout(stallTimer.current);
      stallTimer.current = setTimeout(fail, STALL_LIMIT_MS);
    };
    // Pausa externa (otra app, una llamada): se respeta, no se reconecta. Cuando el servidor corta el
    // flujo el navegador también dispara "pause", justo antes de "ended": eso es un corte, no una pausa.
    const onPause = () => {
      if (wantedRef.current && audio.src && !audio.ended && !audio.error) stop();
    };
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("stalled", onWaiting);
    audio.addEventListener("error", fail);
    audio.addEventListener("ended", fail);
    audio.addEventListener("pause", onPause);

    return () => {
      wantedRef.current = false;
      clearTimers();
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("stalled", onWaiting);
      audio.removeEventListener("error", fail);
      audio.removeEventListener("ended", fail);
      audio.removeEventListener("pause", onPause);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audioRef.current = null;
    };
  }, [clearTimers, fail, stop]);

  const play = useCallback(() => {
    if (!streamUrl) return;
    wantedRef.current = true;
    attemptRef.current = 0;
    setStatus("connecting");
    connect();
  }, [connect, streamUrl]);

  const toggle = useCallback(() => {
    if (wantedRef.current) stop();
    else play();
  }, [play, stop]);

  const setVolume = useCallback((value: number) => {
    const next = Math.min(1, Math.max(0, value));
    if (audioRef.current) audioRef.current.volume = next;
    setVolumeState(next);
    try {
      localStorage.setItem(VOLUME_KEY, String(next));
    } catch {
      // Sin almacenamiento: el volumen vale solo para esta visita.
    }
  }, []);

  return { status, volume, setVolume, play, stop, toggle, available: streamUrl !== null };
}
