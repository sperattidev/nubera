"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default function PanelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Card>
      <EmptyState
        icon={AlertTriangle}
        title="Algo salió mal"
        description="Ocurrió un error inesperado al mostrar esta pantalla. Podés reintentar; si sigue pasando, avisanos."
        action={<Button onClick={reset}>Reintentar</Button>}
      />
    </Card>
  );
}
