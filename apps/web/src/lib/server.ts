import { cookies } from "next/headers";
import { cache } from "react";
import type { SessionUser, Station } from "./types";

/** Dirección interna de la API (no es pública: solo la usa el servidor del panel). */
export const API_URL = process.env.API_URL ?? "http://127.0.0.1:53000";

async function fetchApi<T>(path: string): Promise<T | null> {
  const cookieHeader = (await cookies()).toString();
  try {
    const response = await fetch(`${API_URL}${path}`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    // La API no responde: se trata como sesión no disponible.
    return null;
  }
}

/** Usuario de la sesión actual, o null si no hay sesión válida. Una consulta por pedido. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const data = await fetchApi<{ user: SessionUser }>("/auth/me");
  return data?.user ?? null;
});

export const getStations = cache(async (): Promise<Station[]> => {
  const data = await fetchApi<{ items: Station[] }>("/stations");
  return data?.items ?? [];
});
