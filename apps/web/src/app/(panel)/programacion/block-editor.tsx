"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Megaphone, Plus, Trash2 } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api, errorMessage } from "@/lib/api";
import { ASSET_CATEGORIES, CATEGORY_COLOR, CATEGORY_LABEL, isCategory, type AssetCategory } from "@/lib/categories";
import { describeRules, poolShares } from "@/lib/rotation-summary";
import {
  blockToForm,
  DAYS,
  describeDays,
  formProblems,
  formToPayload,
  newForm,
  overlapsOf,
  TIME_OPTIONS,
  type BlockForm,
  type ScheduleBlock,
} from "@/lib/schedule";
import { cn } from "@/lib/utils";

export type EditorTarget = { mode: "create"; day: number; minute: number } | { mode: "edit"; block: ScheduleBlock };

/** La publicidad se programa con tandas; no es una categoría más de la mezcla. */
const MIX_CATEGORIES = ASSET_CATEGORIES.filter((category) => category !== "ad");

export function BlockEditor({
  target,
  blocks,
  stationId,
  canWrite,
  onClose,
}: {
  target: EditorTarget | null;
  blocks: ScheduleBlock[];
  stationId: string;
  canWrite: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        {target && (
          <EditorForm
            key={target.mode === "edit" ? target.block.id : `new-${target.day}-${target.minute}`}
            target={target}
            blocks={blocks}
            stationId={stationId}
            canWrite={canWrite}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditorForm({
  target,
  blocks,
  stationId,
  canWrite,
  onClose,
}: {
  target: EditorTarget;
  blocks: ScheduleBlock[];
  stationId: string;
  canWrite: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const editing = target.mode === "edit" ? target.block : null;
  const [form, setForm] = useState<BlockForm>(() => (editing ? blockToForm(editing) : newForm(target.mode === "create" ? target.day : 1, target.mode === "create" ? target.minute : 0)));
  const [attempted, setAttempted] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const set = <K extends keyof BlockForm>(key: K, value: BlockForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  const problems = useMemo(() => formProblems(form), [form]);
  const overlaps = useMemo(
    () => overlapsOf({ id: editing?.id ?? "", days: form.days, start: form.start, end: form.end }, blocks),
    [editing?.id, form.days, form.start, form.end, blocks],
  );
  const shares = useMemo(() => poolShares(form.pool.filter((entry) => entry.weight > 0)), [form.pool]);
  const rules = useMemo(() => describeRules(formToPayload(form).rotation), [form]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["schedule", stationId] });
    queryClient.invalidateQueries({ queryKey: ["on-air", stationId] });
  };

  const save = useMutation({
    mutationFn: () =>
      editing
        ? api<ScheduleBlock>(`/stations/${stationId}/schedule/${editing.id}`, { method: "PUT", body: formToPayload(form) })
        : api<ScheduleBlock>(`/stations/${stationId}/schedule`, { method: "POST", body: formToPayload(form) }),
    onSuccess: () => {
      refresh();
      toast.success(editing ? "Bloque actualizado" : "Bloque creado");
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: () => api(`/stations/${stationId}/schedule/${editing!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      refresh();
      toast.success("Bloque eliminado");
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (problems.length === 0) {
      save.mutate();
    }
  }

  const usedPool = new Set(form.pool.map((entry) => entry.category));
  const usedInsertions = new Set(form.insertions.map((entry) => entry.category));

  return (
    <>
      <form onSubmit={submit} className="grid gap-6">
        <DialogHeader>
          <DialogTitle>{editing ? (canWrite ? "Editar bloque" : editing.name) : "Nuevo bloque"}</DialogTitle>
          <DialogDescription>
            {canWrite
              ? "Un bloque define qué suena en cada franja horaria y con qué reglas."
              : `${describeDays(editing?.days ?? [])} · ${editing?.start} a ${editing?.end}. Solo lectura.`}
          </DialogDescription>
        </DialogHeader>

        <fieldset disabled={!canWrite || save.isPending} className="grid min-w-0 gap-6 border-0 p-0">
          {/* Datos generales */}
          <Section title="Cuándo">
            <div className="grid gap-2">
              <Label htmlFor="block-name">Nombre</Label>
              <Input id="block-name" value={form.name} maxLength={120} placeholder="Ej.: Mañana de lunes a viernes" onChange={(event) => set("name", event.target.value)} autoFocus={canWrite} />
            </div>

            <div className="grid gap-2">
              <Label>Días</Label>
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
            </div>

            <div className="grid grid-cols-2 gap-4">
              <TimeField id="block-start" label="Desde" value={form.start} onChange={(value) => set("start", value)} options={TIME_OPTIONS.slice(0, -1)} />
              <TimeField id="block-end" label="Hasta" value={form.end} onChange={(value) => set("end", value)} options={TIME_OPTIONS.slice(1)} />
            </div>
          </Section>

          {/* Mezcla */}
          <Section title="Qué suena" hint="Cada vez que hay que elegir un tema, se sortea una categoría según su peso.">
            <div className="grid gap-2">
              {form.pool.map((entry, index) => (
                <Row key={index}>
                  <CategorySelect
                    value={entry.category}
                    exclude={usedPool}
                    allowed={MIX_CATEGORIES}
                    onChange={(category) => set("pool", form.pool.map((item, i) => (i === index ? { ...item, category } : item)))}
                    label={`Categoría ${index + 1}`}
                  />
                  <NumberField
                    label="Peso"
                    value={entry.weight}
                    min={1}
                    max={100}
                    onChange={(weight) => set("pool", form.pool.map((item, i) => (i === index ? { ...item, weight } : item)))}
                  />
                  <RemoveButton label="Quitar categoría" onClick={() => set("pool", form.pool.filter((_, i) => i !== index))} disabled={form.pool.length === 1} />
                </Row>
              ))}
              <AddButton
                onClick={() => {
                  const next = MIX_CATEGORIES.find((category) => !usedPool.has(category));
                  if (next) set("pool", [...form.pool, { category: next, weight: 1 }]);
                }}
                disabled={MIX_CATEGORIES.every((category) => usedPool.has(category))}
              >
                Agregar categoría
              </AddButton>
            </div>

            {shares.length > 0 && (
              <div className="grid gap-2">
                <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                  {shares.map((share) => (
                    <span key={share.category} style={{ width: `${share.percent}%`, backgroundColor: CATEGORY_COLOR[share.category] }} />
                  ))}
                </div>
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {shares.map((share) => (
                    <span key={share.category} className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ backgroundColor: CATEGORY_COLOR[share.category] }} aria-hidden />
                      {CATEGORY_LABEL[share.category]} {share.percent} %
                    </span>
                  ))}
                </p>
              </div>
            )}
          </Section>

          {/* Intercalados */}
          <Section title="Intercalar" hint="Por ejemplo, un jingle cada 4 emisiones.">
            <div className="grid gap-2">
              {form.insertions.map((entry, index) => (
                <Row key={index}>
                  <CategorySelect
                    value={entry.category}
                    exclude={usedInsertions}
                    allowed={MIX_CATEGORIES}
                    onChange={(category) => set("insertions", form.insertions.map((item, i) => (i === index ? { ...item, category } : item)))}
                    label={`Categoría intercalada ${index + 1}`}
                  />
                  <NumberField
                    label="Cada"
                    suffix="emisiones"
                    value={entry.everyTracks}
                    min={1}
                    max={50}
                    onChange={(everyTracks) => set("insertions", form.insertions.map((item, i) => (i === index ? { ...item, everyTracks } : item)))}
                  />
                  <RemoveButton label="Quitar intercalado" onClick={() => set("insertions", form.insertions.filter((_, i) => i !== index))} />
                </Row>
              ))}
              <AddButton
                onClick={() => {
                  const next = MIX_CATEGORIES.find((category) => !usedInsertions.has(category) && category !== "music") ?? MIX_CATEGORIES.find((category) => !usedInsertions.has(category));
                  if (next) set("insertions", [...form.insertions, { category: next, everyTracks: 4 }]);
                }}
                disabled={MIX_CATEGORIES.every((category) => usedInsertions.has(category))}
              >
                Agregar intercalado
              </AddButton>
            </div>
          </Section>

          {/* Tandas */}
          <Section title="Publicidad">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/40 px-4 py-3">
              <div className="flex items-start gap-3">
                <Megaphone className="mt-0.5 size-4 text-[var(--cat-ad)]" aria-hidden />
                <div>
                  <Label htmlFor="block-ads">Emitir tandas publicitarias</Label>
                  <p className="text-xs text-muted-foreground">Usa las campañas vigentes y respeta la exclusividad de rubro.</p>
                </div>
              </div>
              <Switch id="block-ads" checked={form.adsEnabled} onCheckedChange={(checked) => set("adsEnabled", checked)} />
            </div>
            {form.adsEnabled && (
              <div className="grid grid-cols-2 gap-4">
                <NumberField label="Una tanda cada" suffix="emisiones" value={form.adsEveryTracks} min={1} max={50} onChange={(value) => set("adsEveryTracks", value)} stacked />
                <NumberField label="Avisos por tanda" suffix="hasta" value={form.adsSpotsPerBreak} min={1} max={6} onChange={(value) => set("adsSpotsPerBreak", value)} stacked />
              </div>
            )}
          </Section>

          {/* Separaciones */}
          <Section title="Evitar repeticiones">
            <div className="grid grid-cols-2 gap-4">
              <NumberField label="Mismo artista" suffix="emisiones" value={form.artistSeparation} min={0} max={50} onChange={(value) => set("artistSeparation", value)} stacked />
              <NumberField label="Mismo tema" suffix="minutos" value={form.trackSeparationMinutes} min={0} max={1440} onChange={(value) => set("trackSeparationMinutes", value)} stacked />
            </div>
            <p className="text-xs text-muted-foreground">Con 0 no se aplica. Si no hay alternativa, el motor afloja la regla antes que dejar el aire sin música.</p>
          </Section>
        </fieldset>

        {rules.length > 0 && (
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Resumen de reglas</p>
            <ul className="grid gap-1 text-[13px]">
              {rules.map((rule) => (
                <li key={rule} className="flex gap-2">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" aria-hidden />
                  {rule}
                </li>
              ))}
            </ul>
          </div>
        )}

        {canWrite && overlaps.length > 0 && (
          <Callout tone="warning" title="Se superpone con otros bloques">
            {overlaps.map((other) => `${other.name} (${describeDays(other.days)}, ${other.start} a ${other.end})`).join(" · ")}. Donde coinciden manda el que empieza más tarde (y si empiezan a la vez, el más corto).
          </Callout>
        )}

        {canWrite && attempted && problems.length > 0 && (
          <Callout tone="danger" title="Falta corregir algo">
            <ul className="grid gap-0.5">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </Callout>
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
                {editing ? "Guardar cambios" : "Crear bloque"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </form>

      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar este bloque?</DialogTitle>
            <DialogDescription>
              <strong className="font-medium text-foreground">{editing?.name}</strong> deja de aplicarse. En esa franja el motor va a emitir su biblioteca de respaldo
              hasta que programes otro bloque.
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

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-end gap-2 sm:gap-3">{children}</div>;
}

function CategorySelect({
  value,
  exclude,
  allowed,
  onChange,
  label,
}: {
  value: AssetCategory;
  exclude: Set<AssetCategory>;
  allowed: readonly AssetCategory[];
  onChange: (category: AssetCategory) => void;
  label: string;
}) {
  return (
    <Select value={value} onValueChange={(next) => isCategory(next) && onChange(next)}>
      <SelectTrigger aria-label={label}>
        <span className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ backgroundColor: CATEGORY_COLOR[value] }} aria-hidden />
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        {allowed.map((category) => (
          <SelectItem key={category} value={category} disabled={category !== value && exclude.has(category)}>
            {CATEGORY_LABEL[category]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  suffix,
  stacked,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  /** Con etiqueta visible arriba (en filas sueltas); si no, la etiqueta es solo para lectores de pantalla. */
  stacked?: boolean;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className={cn(!stacked && "sr-only")}>
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
          className="w-20 text-center tabular-nums"
        />
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

function TimeField({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: string[]; onChange: (value: string) => void }) {
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

function AddButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <Button type="button" variant="ghost" size="sm" className="justify-self-start text-primary hover:text-primary" onClick={onClick} disabled={disabled}>
      <Plus /> {children}
    </Button>
  );
}

function RemoveButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <Button type="button" variant="ghost" size="icon" onClick={onClick} disabled={disabled} aria-label={label}>
      <Trash2 />
    </Button>
  );
}

function Callout({ tone, title, children }: { tone: "warning" | "danger"; title: string; children: React.ReactNode }) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex gap-3 rounded-lg border px-4 py-3 text-[13px]",
        tone === "warning" ? "border-warning/30 bg-warning/10 text-warning" : "border-destructive/30 bg-destructive/10 text-destructive",
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="grid gap-0.5">
        <p className="font-medium">{title}</p>
        <div className="text-foreground/80">{children}</div>
      </div>
    </div>
  );
}
