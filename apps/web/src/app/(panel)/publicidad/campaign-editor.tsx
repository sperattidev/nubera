"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Megaphone, Pause, Play, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api, errorMessage } from "@/lib/api";
import { campaignPayload, campaignProblems, campaignToForm, newCampaignForm, type Advertiser, type Campaign, type CampaignForm } from "@/lib/ads";
import { useAdSpots } from "@/lib/ads-queries";
import { useAudioPlayer } from "@/lib/audio-player";
import { formatBytes } from "@/lib/format";
import { DAYS, TIME_OPTIONS } from "@/lib/schedule";
import { cn } from "@/lib/utils";

export type CampaignTarget = { mode: "create" } | { mode: "edit"; campaign: Campaign };

export function CampaignEditor({
  target,
  advertisers,
  stationId,
  today,
  canWrite,
  onClose,
}: {
  target: CampaignTarget | null;
  advertisers: Advertiser[];
  stationId: string;
  today: string;
  canWrite: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        {target && (
          <Form
            key={target.mode === "edit" ? target.campaign.id : "new"}
            target={target}
            advertisers={advertisers}
            stationId={stationId}
            today={today}
            canWrite={canWrite}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Form({
  target,
  advertisers,
  stationId,
  today,
  canWrite,
  onClose,
}: {
  target: CampaignTarget;
  advertisers: Advertiser[];
  stationId: string;
  today: string;
  canWrite: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const editing = target.mode === "edit" ? target.campaign : null;
  const [form, setForm] = useState<CampaignForm>(() =>
    editing ? campaignToForm(editing) : newCampaignForm(today, advertisers.find((advertiser) => advertiser.isActive)?.id ?? ""),
  );
  const [attempted, setAttempted] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const set = <K extends keyof CampaignForm>(key: K, value: CampaignForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const problems = useMemo(() => campaignProblems(form), [form]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["campaigns", stationId] });

  const save = useMutation({
    mutationFn: () =>
      editing
        ? api<Campaign>(`/stations/${stationId}/campaigns/${editing.id}`, { method: "PUT", body: campaignPayload(form) })
        : api<Campaign>(`/stations/${stationId}/campaigns`, { method: "POST", body: campaignPayload(form) }),
    onSuccess: () => {
      refresh();
      toast.success(editing ? "Campaña actualizada" : "Campaña creada");
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: () => api(`/stations/${stationId}/campaigns/${editing!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      refresh();
      toast.success("Campaña eliminada");
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (problems.length === 0) save.mutate();
  }

  return (
    <>
      <form onSubmit={submit} className="grid gap-6">
        <DialogHeader>
          <DialogTitle>{editing ? (canWrite ? "Editar campaña" : editing.name) : "Nueva campaña"}</DialogTitle>
          <DialogDescription>
            {canWrite ? "Define qué avisos salen al aire, cuándo y con qué frecuencia." : `${editing?.advertiserName}. Solo lectura.`}
          </DialogDescription>
        </DialogHeader>

        <fieldset disabled={!canWrite || save.isPending} className="grid min-w-0 gap-6 border-0 p-0">
          <Section title="Quién y cuándo">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="campaign-advertiser">Anunciante</Label>
                <Select value={form.advertiserId} onValueChange={(value) => set("advertiserId", value)}>
                  <SelectTrigger id="campaign-advertiser">
                    <SelectValue placeholder="Elegí un anunciante" />
                  </SelectTrigger>
                  <SelectContent>
                    {advertisers.map((advertiser) => (
                      <SelectItem key={advertiser.id} value={advertiser.id} disabled={!advertiser.isActive && advertiser.id !== form.advertiserId}>
                        {advertiser.name}
                        {!advertiser.isActive && " (inactivo)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="campaign-name">Nombre de la campaña</Label>
                <Input id="campaign-name" value={form.name} maxLength={120} placeholder="Ej.: Ofertas de octubre" onChange={(event) => set("name", event.target.value)} autoFocus={canWrite} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="campaign-from">Desde</Label>
                <Input id="campaign-from" type="date" value={form.startsOn} onChange={(event) => set("startsOn", event.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="campaign-to">Hasta (inclusive)</Label>
                <Input id="campaign-to" type="date" value={form.endsOn} min={form.startsOn} onChange={(event) => set("endsOn", event.target.value)} />
              </div>
            </div>
          </Section>

          <Section title="Dónde suena" hint="Dentro de las fechas, solo en los días y la franja horaria que elijas.">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Días de la semana">
              {DAYS.map(({ iso, initial, long }) => {
                const on = form.days.includes(iso);
                return (
                  <button
                    key={iso}
                    type="button"
                    aria-pressed={on}
                    aria-label={long}
                    onClick={() => set("days", on ? form.days.filter((day) => day !== iso) : [...form.days, iso])}
                    className={cn(
                      "size-9 rounded-lg border text-[13px] font-semibold transition-colors disabled:opacity-60",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card/60 text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {initial}
                  </button>
                );
              })}
              <Button type="button" variant="ghost" size="sm" onClick={() => set("days", [1, 2, 3, 4, 5])}>
                Lun a Vie
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => set("days", [1, 2, 3, 4, 5, 6, 7])}>
                Todos
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <TimeSelect id="campaign-start" label="Desde las" value={form.start} options={TIME_OPTIONS.slice(0, -1)} onChange={(value) => set("start", value)} />
              <TimeSelect id="campaign-end" label="Hasta las" value={form.end} options={TIME_OPTIONS.slice(1)} onChange={(value) => set("end", value)} />
            </div>
          </Section>

          <Section title="Con qué frecuencia" hint="Con varias campañas a la vez, sale más la que tiene más peso o menos emisiones en el día.">
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField label="Peso" suffix="(1 a 100)" value={form.weight} min={1} max={100} onChange={(value) => set("weight", value)} />
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="campaign-limit">Tope diario</Label>
                  <Switch id="campaign-limit" checked={form.limitDaily} onCheckedChange={(checked) => set("limitDaily", checked)} />
                </div>
                {form.limitDaily ? (
                  <NumberField label="Emisiones por día" hideLabel suffix="como máximo" value={form.dailyPlays} min={1} max={1000} onChange={(value) => set("dailyPlays", value)} />
                ) : (
                  <p className="text-xs text-muted-foreground">Sin tope: sale todas las veces que le toque.</p>
                )}
              </div>
            </div>
          </Section>

          <SpotPicker stationId={stationId} selected={form.assetIds} onChange={(ids) => set("assetIds", ids)} disabled={!canWrite} />

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/40 px-4 py-3">
            <div>
              <Label htmlFor="campaign-active">Campaña activa</Label>
              <p className="text-xs text-muted-foreground">Al pausarla deja de salir al aire sin perder su configuración.</p>
            </div>
            <Switch id="campaign-active" checked={form.isActive} onCheckedChange={(checked) => set("isActive", checked)} />
          </div>
        </fieldset>

        {canWrite && attempted && problems.length > 0 && (
          <div role="alert" className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="grid gap-0.5">
              <p className="font-medium">Falta corregir algo</p>
              <ul className="text-foreground/80">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
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
                {editing ? "Guardar cambios" : "Crear campaña"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </form>

      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar esta campaña?</DialogTitle>
            <DialogDescription>
              <strong className="font-medium text-foreground">{editing?.name}</strong> deja de salir al aire. Los avisos siguen en la biblioteca y las emisiones pasadas se conservan en el
              historial. Si solo querés frenarla un tiempo, es mejor pausarla.
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

/** Lista de avisos de la biblioteca (categoría Publicidad) para marcar los de la campaña. */
function SpotPicker({ stationId, selected, onChange, disabled }: { stationId: string; selected: string[]; onChange: (ids: string[]) => void; disabled: boolean }) {
  const spots = useAdSpots(stationId);
  const player = useAudioPlayer();
  const [search, setSearch] = useState("");
  const items = spots.data?.items ?? [];
  const visible = items.filter((item) => `${item.title} ${item.artist ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);

  return (
    <Section title="Avisos" hint="Los audios de la biblioteca con categoría Publicidad. Si hay varios, rotan.">
      {spots.isPending ? (
        <p className="text-sm text-muted-foreground">Cargando avisos…</p>
      ) : items.length === 0 ? (
        <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-[13px]">
          <Megaphone className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p className="text-foreground/80">
            Todavía no hay avisos. Subí los audios a la{" "}
            <Link href="/biblioteca" className="font-medium text-primary underline-offset-2 hover:underline">
              biblioteca
            </Link>{" "}
            con la categoría <strong className="font-medium">Publicidad</strong> y volvé a armar la campaña.
          </p>
        </div>
      ) : (
        <div className="grid gap-2">
          {items.length > 6 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar aviso" className="pl-9" aria-label="Buscar aviso" />
            </div>
          )}
          <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {visible.map((item) => {
              const checked = selected.includes(item.id);
              const playing = player.track?.id === item.id && player.playing;
              return (
                <li key={item.id} className={cn("flex items-center gap-3 px-3 py-2", checked && "bg-primary/5")}>
                  <input
                    id={`spot-${item.id}`}
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggle(item.id)}
                    className="size-4 shrink-0 accent-[var(--primary)]"
                  />
                  <label htmlFor={`spot-${item.id}`} className="min-w-0 flex-1 cursor-pointer">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.artist ?? "Sin detalle"} · {formatBytes(item.sizeBytes)}
                    </span>
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => player.play({ id: item.id, stationId: item.stationId, title: item.title, artist: item.artist })}
                    aria-label={`${playing ? "Pausar" : "Escuchar"} ${item.title}`}
                  >
                    {playing ? <Pause /> : <Play />}
                  </Button>
                </li>
              );
            })}
            {visible.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted-foreground">Ningún aviso coincide.</li>}
          </ul>
          <p className="text-xs text-muted-foreground">
            {selected.length} {selected.length === 1 ? "aviso elegido" : "avisos elegidos"}
          </p>
        </div>
      )}
    </Section>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function TimeSelect({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="font-mono tabular-nums">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option} className="font-mono tabular-nums">
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function NumberField({
  label,
  hideLabel,
  suffix,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hideLabel?: boolean;
  suffix?: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id} className={cn(hideLabel && "sr-only")}>
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={Number.isFinite(value) ? value : ""}
          onChange={(event) => onChange(event.target.value === "" ? Number.NaN : Number(event.target.value))}
          className="w-24 text-center tabular-nums"
        />
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}
