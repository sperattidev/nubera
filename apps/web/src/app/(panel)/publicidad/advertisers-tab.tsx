"use client";

import { localDate } from "@nubera/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Building2, Plus, SearchX, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  advertiserPayload,
  advertiserProblems,
  advertiserToForm,
  campaignStatus,
  emptyAdvertiserForm,
  type Advertiser,
  type AdvertiserForm,
  type Campaign,
} from "@/lib/ads";
import { useAdvertisers, useCampaigns } from "@/lib/ads-queries";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

type Target = { mode: "create" } | { mode: "edit"; advertiser: Advertiser };

export function AdvertisersTab({ stationId, timeZone, canWrite }: { stationId: string; timeZone: string; canWrite: boolean }) {
  const advertisers = useAdvertisers();
  const campaigns = useCampaigns(stationId);
  const [target, setTarget] = useState<Target | null>(null);

  const today = localDate(new Date(), timeZone);
  const campaignsByAdvertiser = useMemo(() => {
    const result = new Map<string, Campaign[]>();
    for (const campaign of campaigns.data?.items ?? []) {
      result.set(campaign.advertiserId, [...(result.get(campaign.advertiserId) ?? []), campaign]);
    }
    return result;
  }, [campaigns.data]);

  const items = advertisers.data?.items ?? [];

  return (
    <>
      {canWrite && items.length > 0 && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setTarget({ mode: "create" })}>
            <Plus /> Nuevo anunciante
          </Button>
        </div>
      )}

      <Card className="overflow-hidden">
        {advertisers.isPending ? (
          <div className="divide-y divide-border" aria-busy>
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="flex items-center gap-4 px-4 py-4">
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="ml-auto h-5 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : advertisers.isError ? (
          <EmptyState
            icon={SearchX}
            title="No se pudieron cargar los anunciantes"
            action={
              <Button variant="outline" onClick={() => advertisers.refetch()}>
                Reintentar
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Todavía no hay anunciantes"
            description="Cargá a los comercios que pautan en tu radio. Después les armás campañas y les entregás su certificado de emisión."
            action={
              canWrite && (
                <Button onClick={() => setTarget({ mode: "create" })}>
                  <Plus /> Cargar el primer anunciante
                </Button>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Anunciante</th>
                  <th className="hidden px-3 py-3 font-medium md:table-cell">Rubro</th>
                  <th className="hidden px-3 py-3 font-medium lg:table-cell">Contacto</th>
                  <th className="px-3 py-3 text-right font-medium">Campañas vigentes</th>
                  <th className="px-3 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((advertiser) => {
                  const own = campaignsByAdvertiser.get(advertiser.id) ?? [];
                  const active = own.filter((campaign) => campaignStatus(campaign, today) === "active").length;
                  return (
                    <tr
                      key={advertiser.id}
                      className={cn("cursor-pointer transition-colors hover:bg-accent/40", !advertiser.isActive && "opacity-60")}
                      onClick={() => setTarget({ mode: "edit", advertiser })}
                    >
                      <td className="max-w-0 px-4 py-3">
                        <button
                          type="button"
                          className="block max-w-full text-left"
                          onClick={(event) => {
                            event.stopPropagation();
                            setTarget({ mode: "edit", advertiser });
                          }}
                        >
                          <span className="block truncate font-medium">{advertiser.name}</span>
                          <span className="block truncate text-[13px] text-muted-foreground md:hidden">{advertiser.industry ?? "Sin rubro"}</span>
                        </button>
                      </td>
                      <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">{advertiser.industry ?? "—"}</td>
                      <td className="hidden max-w-0 px-3 py-3 text-muted-foreground lg:table-cell">
                        <span className="block truncate">{[advertiser.contactName, advertiser.contactEmail ?? advertiser.contactPhone].filter(Boolean).join(" · ") || "—"}</span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums">{active}</td>
                      <td className="px-3 py-3">
                        <Badge tone={advertiser.isActive ? "success" : "neutral"}>{advertiser.isActive ? "Activo" : "Inactivo"}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AdvertiserDialog target={target} campaignCount={target?.mode === "edit" ? (campaignsByAdvertiser.get(target.advertiser.id)?.length ?? 0) : 0} canWrite={canWrite} onClose={() => setTarget(null)} />
    </>
  );
}

function AdvertiserDialog({ target, campaignCount, canWrite, onClose }: { target: Target | null; campaignCount: number; canWrite: boolean; onClose: () => void }) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {target && <AdvertiserForm key={target.mode === "edit" ? target.advertiser.id : "new"} target={target} campaignCount={campaignCount} canWrite={canWrite} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function AdvertiserForm({ target, campaignCount, canWrite, onClose }: { target: Target; campaignCount: number; canWrite: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const editing = target.mode === "edit" ? target.advertiser : null;
  const [form, setForm] = useState<AdvertiserForm>(() => (editing ? advertiserToForm(editing) : emptyAdvertiserForm()));
  const [attempted, setAttempted] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const set = <K extends keyof AdvertiserForm>(key: K, value: AdvertiserForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const problems = useMemo(() => advertiserProblems(form), [form]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["advertisers"] });
    queryClient.invalidateQueries({ queryKey: ["campaigns"] });
  };

  const save = useMutation({
    mutationFn: () =>
      editing
        ? api<Advertiser>(`/advertisers/${editing.id}`, { method: "PUT", body: advertiserPayload(form) })
        : api<Advertiser>("/advertisers", { method: "POST", body: advertiserPayload(form) }),
    onSuccess: () => {
      refresh();
      toast.success(editing ? "Anunciante actualizado" : "Anunciante creado");
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: () => api(`/advertisers/${editing!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      refresh();
      toast.success("Anunciante eliminado");
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <>
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          setAttempted(true);
          if (problems.length === 0) save.mutate();
        }}
      >
        <DialogHeader>
          <DialogTitle>{editing ? (canWrite ? "Editar anunciante" : editing.name) : "Nuevo anunciante"}</DialogTitle>
          <DialogDescription>
            El rubro evita que dos comercios del mismo rubro (por ejemplo, dos supermercados) salgan seguidos dentro de una tanda.
          </DialogDescription>
        </DialogHeader>

        <fieldset disabled={!canWrite || save.isPending} className="grid min-w-0 gap-4 border-0 p-0">
          <div className="grid gap-2">
            <Label htmlFor="adv-name">Nombre</Label>
            <Input id="adv-name" value={form.name} maxLength={120} onChange={(event) => set("name", event.target.value)} autoFocus={canWrite} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="adv-industry">Rubro</Label>
            <Input id="adv-industry" value={form.industry} maxLength={80} placeholder="Ej.: supermercado, farmacia, concesionaria" onChange={(event) => set("industry", event.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="adv-contact">Persona de contacto</Label>
              <Input id="adv-contact" value={form.contactName} maxLength={120} onChange={(event) => set("contactName", event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="adv-phone">Teléfono</Label>
              <Input id="adv-phone" type="tel" value={form.contactPhone} maxLength={40} onChange={(event) => set("contactPhone", event.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="adv-email">Email</Label>
            <Input id="adv-email" type="email" value={form.contactEmail} onChange={(event) => set("contactEmail", event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="adv-notes">Notas</Label>
            <textarea
              id="adv-notes"
              value={form.notes}
              maxLength={1000}
              rows={3}
              onChange={(event) => set("notes", event.target.value)}
              className="w-full rounded-lg border border-input bg-card/60 px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50"
              placeholder="Condiciones del contrato, forma de pago, recordatorios…"
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/40 px-4 py-3">
            <div>
              <Label htmlFor="adv-active">Anunciante activo</Label>
              <p className="text-xs text-muted-foreground">Si está inactivo, sus campañas dejan de salir al aire.</p>
            </div>
            <Switch id="adv-active" checked={form.isActive} onCheckedChange={(checked) => set("isActive", checked)} />
          </div>
        </fieldset>

        {canWrite && attempted && problems.length > 0 && (
          <div role="alert" className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <ul className="text-foreground/80">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter className="items-center sm:justify-between">
          {canWrite && editing ? (
            <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive sm:mr-auto" onClick={() => setConfirmingDelete(true)}>
              <Trash2 /> Eliminar
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={onClose}>
              {canWrite ? "Cancelar" : "Cerrar"}
            </Button>
            {canWrite && (
              <Button type="submit" loading={save.isPending}>
                {editing ? "Guardar cambios" : "Crear anunciante"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </form>

      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar este anunciante?</DialogTitle>
            <DialogDescription>
              <strong className="font-medium text-foreground">{editing?.name}</strong> se elimina junto con sus campañas
              {campaignCount > 0 ? ` (${campaignCount} en esta emisora)` : ""}. Las emisiones pasadas se conservan en el historial, pero ya no vas a poder emitir su certificado. Si solo querés
              frenar su publicidad, es mejor marcarlo como inactivo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmingDelete(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" loading={remove.isPending} onClick={() => remove.mutate()}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
