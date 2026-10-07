"use client";

import { can, type Permission } from "@nubera/core";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { STATION_COOKIE_NAME } from "./constants";
import type { SessionUser, Station } from "./types";

interface SessionValue {
  user: SessionUser;
  stations: Station[];
  /** Emisora activa; null si el cliente todavía no tiene ninguna. */
  station: Station | null;
  selectStation: (id: string) => void;
  /** Qué puede hacer el usuario. Solo oculta acciones: la API siempre decide. */
  allowed: (permission: Permission) => boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({
  user,
  stations,
  initialStationId,
  children,
}: {
  user: SessionUser;
  stations: Station[];
  initialStationId: string | null;
  children: React.ReactNode;
}) {
  const [stationId, setStationId] = useState(
    stations.some((s) => s.id === initialStationId) ? initialStationId : (stations[0]?.id ?? null),
  );

  const selectStation = useCallback((id: string) => {
    setStationId(id);
    document.cookie = `${STATION_COOKIE_NAME}=${id}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      user,
      stations,
      station: stations.find((s) => s.id === stationId) ?? null,
      selectStation,
      allowed: (permission) => can(user.role, permission),
    }),
    [user, stations, stationId, selectStation],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession debe usarse dentro de SessionProvider");
  }
  return value;
}

/** La emisora activa; solo se usa en pantallas que el panel muestra cuando hay una. */
export function useStation(): Station {
  const { station } = useSession();
  if (!station) {
    throw new Error("No hay emisora activa");
  }
  return station;
}
