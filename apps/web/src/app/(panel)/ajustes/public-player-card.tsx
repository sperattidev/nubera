"use client";

import { ExternalLink, Globe } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Label } from "@/components/ui/label";
import { embedCode, publicPageUrl } from "@/lib/public-player";
import type { Station } from "@/lib/types";

/** Dirección de la página pública de la emisora y código para ponerla en el sitio de la radio. */
export function PublicPlayerCard({ station }: { station: Station }) {
  // El origen se conoce recién en el navegador; en el servidor se muestra solo la ruta.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const pageUrl = publicPageUrl(origin, station.slug);
  const code = embedCode(origin, station.slug, station.name);

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <div>
          <CardTitle>Reproductor público</CardTitle>
          <CardDescription>La página donde tus oyentes escuchan la radio en vivo desde el celular o la computadora, sin cuenta ni instalación.</CardDescription>
        </div>
        <Globe className="size-4 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-2">
          <Label htmlFor="public-url">Dirección para compartir</Label>
          <div className="flex gap-2">
            <input
              id="public-url"
              readOnly
              value={pageUrl}
              onFocus={(event) => event.currentTarget.select()}
              className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-card/60 px-3 font-mono text-[13px]"
            />
            <CopyButton value={pageUrl} label="Copiar dirección" size="md" variant="outline" />
            <Button asChild variant="outline">
              <a href={pageUrl} target="_blank" rel="noreferrer">
                <ExternalLink /> Abrir
              </a>
            </Button>
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="embed-code">Para el sitio web de la radio</Label>
          <textarea
            id="embed-code"
            readOnly
            rows={3}
            value={code}
            onFocus={(event) => event.currentTarget.select()}
            className="resize-none rounded-lg border border-input bg-card/60 p-3 font-mono text-[12px] leading-relaxed"
          />
          <div>
            <CopyButton value={code} label="Copiar código" size="md" variant="outline" />
          </div>
          <p className="text-xs text-muted-foreground">Pegalo en la página donde quieras que aparezca el reproductor.</p>
        </div>
      </CardContent>
    </Card>
  );
}
