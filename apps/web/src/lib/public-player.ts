/** Lógica del reproductor público, separada de la interfaz para poder probarla. */

export interface PublicTrack {
  title: string;
  artist: string | null;
  startedAt: string;
}

export interface PublicStation {
  name: string;
  slug: string;
  streamUrl: string | null;
  nowPlaying: PublicTrack | null;
  recent: PublicTrack[];
}

/** Reintentos de conexión antes de rendirse y pedirle a la persona que reintente. */
export const MAX_RETRIES = 8;
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 15_000;

/** Espera antes del reintento número `attempt` (empieza en 0): 1 s, 2 s, 4 s… hasta 15 s. */
export function retryDelayMs(attempt: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** Math.max(0, attempt), RETRY_MAX_MS);
}

/**
 * Dirección del flujo con un parámetro que cambia en cada conexión: al reanudar tras una pausa
 * el navegador no debe reutilizar audio viejo guardado, sino volver al aire.
 */
export function streamSrc(streamUrl: string, nonce: number): string {
  const url = new URL(streamUrl, "http://placeholder.invalid");
  url.searchParams.set("_", String(nonce));
  return /^[a-z][a-z0-9+.-]*:/i.test(streamUrl) ? url.toString() : `${url.pathname}${url.search}`;
}

export interface TrackLabel {
  title: string;
  subtitle: string;
}

/** Qué mostrar como "suena ahora": el tema, o el nombre de la emisora si no hay dato. */
export function trackLabel(nowPlaying: PublicTrack | null, stationName: string): TrackLabel {
  if (!nowPlaying) {
    return { title: stationName, subtitle: "En vivo" };
  }
  return { title: nowPlaying.title, subtitle: nowPlaying.artist ?? stationName };
}

export function publicPageUrl(origin: string, slug: string): string {
  return `${origin}/radio/${slug}`;
}

/** Código para pegar el reproductor en el sitio de la radio. */
export function embedCode(origin: string, slug: string, stationName: string): string {
  const title = `Escuchá ${stationName} en vivo`.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<iframe src="${origin}/embed/${slug}" title="${title}" width="100%" height="120" style="border:0;max-width:480px" allow="autoplay" loading="lazy"></iframe>`;
}
