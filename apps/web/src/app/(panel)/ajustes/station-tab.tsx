"use client";

import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, RadioTower } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errorMessage } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { timeZoneOptions } from "@/lib/settings";
import type { Station } from "@/lib/types";
import { useNow } from "@/lib/use-now";

export function StationTab({ station }: { station: Station }) {
  const router = useRouter();
  const [name, setName] = useState(station.name);
  const [timezone, setTimezone] = useState(station.timezone);
  const now = useNow(30_000);

  const changed = name.trim() !== station.name || timezone !== station.timezone;
  const timezoneChanged = timezone !== station.timezone;

  const save = useMutation({
    mutationFn: () => api<Station>(`/stations/${station.id}`, { method: "PATCH", body: { name: name.trim(), timezone } }),
    onSuccess: () => {
      toast.success("Datos de la emisora actualizados");
      // La lista de emisoras viene del servidor al cargar la página: se vuelve a pedir.
      router.refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <div>
          <CardTitle>Datos de la emisora</CardTitle>
          <CardDescription>El nombre que ve tu equipo y la zona horaria con la que se arma la programación.</CardDescription>
        </div>
        <RadioTower className="size-4 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim() && changed) save.mutate();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="station-name">Nombre</Label>
            <Input id="station-name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="station-timezone">Zona horaria</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger id="station-timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {timeZoneOptions(station.timezone).map((zone) => (
                  <SelectItem key={zone.id} value={zone.id}>
                    {zone.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {now > 0 && (
              <p className="text-xs text-muted-foreground">
                Con esta zona, ahora son las <strong className="font-mono font-medium text-foreground">{formatTime(now, timezone)}</strong>.
              </p>
            )}
          </div>

          {timezoneChanged && (
            <div role="status" className="flex gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-[13px]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <p className="text-foreground/80">
                Cambiar la zona horaria cambia qué bloque de la programación está vigente ahora y cómo se cuentan los días de las campañas y del historial.
              </p>
            </div>
          )}

          <Button type="submit" className="justify-self-start" loading={save.isPending} disabled={!changed || !name.trim()}>
            Guardar cambios
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
