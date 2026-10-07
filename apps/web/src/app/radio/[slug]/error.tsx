"use client";

import { LogoMark } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";

export default function RadioError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="grid max-w-sm justify-items-center gap-4 text-center">
        <LogoMark className="size-12 rounded-2xl" />
        <h1 className="text-2xl font-semibold tracking-tight">No pudimos cargar la radio</h1>
        <p className="text-sm text-muted-foreground">Es un problema de nuestro lado, no tuyo. Probá de nuevo en unos segundos.</p>
        <Button onClick={reset}>Reintentar</Button>
      </div>
    </main>
  );
}
