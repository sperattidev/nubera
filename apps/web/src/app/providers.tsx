"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5_000,
            refetchOnWindowFocus: true,
            // No se reintenta lo que el servidor rechazó de forma definitiva.
            retry: (failures, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failures < 2,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
      <Toaster
        position="bottom-right"
        theme="system"
        toastOptions={{
          classNames: {
            toast: "!bg-card !text-card-foreground !border-border !shadow-lg",
            description: "!text-muted-foreground",
          },
        }}
      />
    </QueryClientProvider>
  );
}
