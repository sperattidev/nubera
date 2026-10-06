"use client";

import { useEffect, useState } from "react";

/** Reloj local que se actualiza cada `intervalMs`. Arranca en 0 para no desfasar el render del servidor. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
