"use client";

import { Check, ChevronsUpDown, RadioTower } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useSession } from "@/lib/session";

export function StationSwitcher() {
  const { stations, station, selectStation } = useSession();
  const queryClient = useQueryClient();

  if (!station) {
    return null;
  }

  // Con una sola emisora no hay nada que elegir: se muestra como etiqueta.
  if (stations.length < 2) {
    return (
      <div className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5">
        <RadioTower className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="max-w-32 truncate whitespace-nowrap text-sm font-medium sm:max-w-none">{station.name}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 whitespace-nowrap rounded-lg border border-border bg-card/60 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent">
        <RadioTower className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="max-w-28 truncate sm:max-w-40">{station.name}</span>
        <ChevronsUpDown className="size-3.5 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Emisora</DropdownMenuLabel>
        {stations.map((item) => (
          <DropdownMenuItem
            key={item.id}
            onSelect={() => {
              selectStation(item.id);
              queryClient.invalidateQueries();
            }}
          >
            <span className="flex-1 truncate">{item.name}</span>
            {item.id === station.id && <Check className="text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
