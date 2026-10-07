import { cache } from "react";
import type { PublicStation } from "./public-player";
import { API_URL } from "./server";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Datos públicos de una emisora (sin sesión), o null si no existe. Si la API no responde se
 * lanza el error, para mostrar "algo falló" y no un falso "esa radio no existe".
 */
export const getPublicStation = cache(async (slug: string): Promise<PublicStation | null> => {
  if (slug.length > 80 || !SLUG.test(slug)) {
    return null;
  }
  const response = await fetch(`${API_URL}/public/stations/${slug}`, { cache: "no-store" });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`La API respondió ${response.status}`);
  }
  return (await response.json()) as PublicStation;
});
