"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { Advertiser, Campaign } from "./ads";
import type { AssetPage } from "./types";

/** Los anunciantes son del cliente (no de una emisora), por eso la clave no lleva emisora. */
export function useAdvertisers() {
  return useQuery({
    queryKey: ["advertisers"],
    queryFn: ({ signal }) => api<{ items: Advertiser[] }>("/advertisers", { signal }),
  });
}

export function useCampaigns(stationId: string) {
  return useQuery({
    queryKey: ["campaigns", stationId],
    queryFn: ({ signal }) => api<{ items: Campaign[] }>(`/stations/${stationId}/campaigns`, { signal }),
  });
}

/** Audios de categoría "ad" de la emisora: los avisos que una campaña puede rotar. */
export function useAdSpots(stationId: string, enabled = true) {
  return useQuery({
    // Empieza con ["assets", stationId] para que se actualice al subir o borrar audios en la biblioteca.
    queryKey: ["assets", stationId, "ad-spots"],
    queryFn: ({ signal }) => api<AssetPage>(`/stations/${stationId}/assets?category=ad&limit=200`, { signal }),
    enabled,
  });
}
