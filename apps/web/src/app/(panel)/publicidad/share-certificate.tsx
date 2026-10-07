"use client";

import { localDate } from "@nubera/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, MessageCircle, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, type Advertiser } from "@/lib/ads";
import { api, errorMessage } from "@/lib/api";
import {
  certificateUrl,
  EXPIRY_OPTIONS,
  linkStatus,
  whatsappUrl,
  type CertificateLink,
  type CreatedCertificateLink,
  type LinkStatus,
} from "@/lib/certificate-links";

const STATUS: Record<LinkStatus, { label: string; tone: "success" | "neutral" | "warning" }> = {
  active: { label: "Activo", tone: "success" },
  expired: { label: "Vencido", tone: "neutral" },
  revoked: { label: "Revocado", tone: "warning" },
};

/** Crea un enlace para que el anunciante vea e imprima su certificado sin tener cuenta. */
export function ShareCertificate({
  stationId,
  advertiser,
  range,
  timeZone,
}: {
  stationId: string;
  advertiser: Advertiser;
  range: { from: Date; to?: Date };
  timeZone: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Share2 /> Compartir enlace
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">{open && <ShareForm stationId={stationId} advertiser={advertiser} range={range} timeZone={timeZone} />}</DialogContent>
    </Dialog>
  );
}

function ShareForm({
  stationId,
  advertiser,
  range,
  timeZone,
}: {
  stationId: string;
  advertiser: Advertiser;
  range: { from: Date; to?: Date };
  timeZone: string;
}) {
  const queryClient = useQueryClient();
  const [days, setDays] = useState<number>(30);
  const [created, setCreated] = useState<CreatedCertificateLink | null>(null);
  // El origen se conoce recién en el navegador.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const listKey = ["certificate-links", advertiser.id];

  const links = useQuery({
    queryKey: listKey,
    queryFn: ({ signal }) => api<{ items: CertificateLink[] }>(`/advertisers/${advertiser.id}/certificate-links`, { signal }),
  });

  const create = useMutation({
    mutationFn: () =>
      api<CreatedCertificateLink>(`/advertisers/${advertiser.id}/certificate-links`, {
        method: "POST",
        // El enlace fija el período: si el elegido llega "hasta ahora", se toma este instante.
        body: { stationId, from: range.from.toISOString(), to: (range.to ?? new Date()).toISOString(), expiresInDays: days },
      }),
    onSuccess: (link) => {
      setCreated(link);
      queryClient.invalidateQueries({ queryKey: listKey });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api(`/certificate-links/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listKey });
      toast.success("Enlace revocado: ya no se puede abrir");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const url = created ? certificateUrl(origin, created.path) : "";
  const now = Date.now();

  return (
    <div className="grid gap-5">
      <DialogHeader>
        <DialogTitle>Compartir el certificado de {advertiser.name}</DialogTitle>
        <DialogDescription>
          Genera un enlace para que el anunciante vea e imprima este certificado, sin cuenta. Muestra exactamente el período elegido y no cambia aunque después salgan más avisos.
        </DialogDescription>
      </DialogHeader>

      {created ? (
        <div className="grid gap-3 rounded-lg border border-border bg-muted/40 p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="size-4 text-success" aria-hidden /> Enlace creado
          </p>
          <input
            readOnly
            aria-label="Enlace al certificado"
            value={url}
            onFocus={(event) => event.currentTarget.select()}
            className="h-9 min-w-0 rounded-lg border border-input bg-card/60 px-3 font-mono text-[13px]"
          />
          <div className="flex flex-wrap gap-2">
            <CopyButton value={url} label="Copiar enlace" size="md" />
            <Button variant="outline" asChild>
              <a href={whatsappUrl(advertiser.name, url)} target="_blank" rel="noreferrer">
                <MessageCircle /> Enviar por WhatsApp
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Quien tenga el enlace puede ver este certificado hasta el {formatDate(localDate(new Date(created.expiresAt), timeZone))}, o hasta que lo revoques. Copialo ahora: no se vuelve a mostrar completo.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid min-w-40 gap-2">
            <Label htmlFor="link-expiry">El enlace dura</Label>
            <Select value={String(days)} onValueChange={(value) => setDays(Number(value))}>
              <SelectTrigger id="link-expiry">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS.map((option) => (
                  <SelectItem key={option.days} value={String(option.days)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => create.mutate()} loading={create.isPending}>
            Crear enlace
          </Button>
        </div>
      )}

      <section className="grid gap-2" aria-label="Enlaces anteriores">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Enlaces de este anunciante</h3>
        {links.isPending ? (
          <Skeleton className="h-14 rounded-lg" />
        ) : links.isError ? (
          <p className="text-sm text-muted-foreground">No se pudieron cargar los enlaces.</p>
        ) : links.data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no creaste ninguno.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {links.data.items.map((link) => {
              const status = linkStatus(link, now);
              return (
                <li key={link.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-[13px]">
                  <span className="min-w-0 flex-1 text-muted-foreground">
                    {formatDate(localDate(new Date(link.from), timeZone))} a {formatDate(localDate(new Date(new Date(link.to).getTime() - 1), timeZone))} · vence{" "}
                    {formatDate(localDate(new Date(link.expiresAt), timeZone))}
                  </span>
                  <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>
                  {status === "active" && (
                    <Button variant="ghost" size="sm" onClick={() => revoke.mutate(link.id)} loading={revoke.isPending && revoke.variables === link.id}>
                      Revocar
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

    </div>
  );
}
