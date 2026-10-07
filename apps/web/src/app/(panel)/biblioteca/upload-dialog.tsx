"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, FileAudio, Loader2, Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errorMessage } from "@/lib/api";
import { ASSET_CATEGORIES, CATEGORY_LABEL, isCategory, type AssetCategory } from "@/lib/categories";
import { formatBytes } from "@/lib/format";
import { ACCEPT_ATTRIBUTE, fileProblem, uploadAsset } from "@/lib/upload";
import { cn } from "@/lib/utils";

type Status = "queued" | "uploading" | "done" | "duplicate" | "error";

interface Item {
  id: number;
  file: File;
  category: AssetCategory;
  status: Status;
  progress: number;
  error?: string;
}

const CONCURRENCY = 2;
let nextId = 1;

export function UploadDialog({
  stationId,
  open,
  onOpenChange,
}: {
  stationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<AssetCategory>("music");
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const aborts = useRef(new Map<number, () => void>());

  const patch = useCallback((id: number, changes: Partial<Item>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }, []);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const added: Item[] = Array.from(files).map((file) => {
        const problem = fileProblem(file);
        return {
          id: nextId++,
          file,
          category,
          status: problem ? "error" : "queued",
          progress: 0,
          error: problem ?? undefined,
        };
      });
      setItems((current) => [...current, ...added]);
    },
    [category],
  );

  // Arranca los archivos en cola respetando la cantidad de subidas simultáneas.
  useEffect(() => {
    const active = items.filter((item) => item.status === "uploading").length;
    const waiting = items.filter((item) => item.status === "queued").slice(0, CONCURRENCY - active);
    for (const item of waiting) {
      patch(item.id, { status: "uploading" });
      const { promise, abort } = uploadAsset(stationId, item.file, item.category, (fraction) =>
        patch(item.id, { progress: fraction }),
      );
      aborts.current.set(item.id, abort);
      promise
        .then(() => {
          patch(item.id, { status: "done", progress: 1 });
          queryClient.invalidateQueries({ queryKey: ["assets", stationId] });
        })
        .catch((error: unknown) => {
          const duplicate = (error as { status?: number }).status === 409;
          patch(item.id, {
            status: duplicate ? "duplicate" : "error",
            error: duplicate ? "Ya estaba en la biblioteca" : errorMessage(error),
          });
        })
        .finally(() => aborts.current.delete(item.id));
    }
  }, [items, patch, queryClient, stationId]);

  const busy = items.some((item) => item.status === "queued" || item.status === "uploading");
  const finished = items.filter((item) => item.status === "done").length;

  function handleOpenChange(next: boolean) {
    if (!next) {
      // Al cerrar se cancela lo que siga en curso y se limpia la lista.
      aborts.current.forEach((abort) => abort());
      setItems([]);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Subir audios</DialogTitle>
          <DialogDescription>Arrastrá los archivos o elegilos desde tu equipo. Se pueden subir varios a la vez.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="upload-category">Categoría de los archivos que agregues</Label>
          <Select value={category} onValueChange={(value) => isCategory(value) && setCategory(value)}>
            <SelectTrigger id="upload-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSET_CATEGORIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {CATEGORY_LABEL[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            addFiles(event.dataTransfer.files);
          }}
          className={cn(
            "grid place-items-center gap-2 rounded-xl border-2 border-dashed border-input px-6 py-9 text-center transition-colors hover:border-primary/60 hover:bg-primary/5",
            dragging && "border-primary bg-primary/10",
          )}
        >
          <Upload className="size-7 text-primary" aria-hidden />
          <span className="text-sm font-medium">Soltá los archivos acá o hacé clic para elegirlos</span>
          <span className="text-xs text-muted-foreground">mp3, wav, flac, ogg, m4a o aac · hasta 200 MB cada uno</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            if (event.target.files) {
              addFiles(event.target.files);
            }
            event.target.value = "";
          }}
        />

        {items.length > 0 && (
          <ul className="grid max-h-64 gap-2 overflow-y-auto pr-1">
            {items.map((item) => (
              <li key={item.id} className="grid gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <FileAudio className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm">{item.file.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(item.file.size)}</span>
                  <StatusIcon status={item.status} />
                </div>
                {(item.status === "uploading" || item.status === "queued") && (
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(item.progress * 100)}>
                    <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${item.progress * 100}%` }} />
                  </div>
                )}
                {item.error && (
                  <p className={cn("text-xs", item.status === "duplicate" ? "text-warning" : "text-destructive")}>{item.error}</p>
                )}
              </li>
            ))}
          </ul>
        )}

        <DialogFooter className="items-center">
          {items.length > 0 && (
            <span className="mr-auto text-xs text-muted-foreground">
              {finished} de {items.length} {items.length === 1 ? "subido" : "subidos"}
            </span>
          )}
          <Button variant={busy ? "outline" : "primary"} onClick={() => handleOpenChange(false)}>
            {busy ? "Cancelar" : "Listo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusIcon({ status }: { status: Status }) {
  switch (status) {
    case "done":
      return <CheckCircle2 className="size-4 shrink-0 text-success" aria-label="Subido" />;
    case "duplicate":
      return <AlertCircle className="size-4 shrink-0 text-warning" aria-label="Duplicado" />;
    case "error":
      return <X className="size-4 shrink-0 text-destructive" aria-label="Error" />;
    case "uploading":
      return <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-label="Subiendo" />;
    default:
      return <span className="size-2 shrink-0 rounded-full bg-muted-foreground/40" aria-label="En cola" />;
  }
}
