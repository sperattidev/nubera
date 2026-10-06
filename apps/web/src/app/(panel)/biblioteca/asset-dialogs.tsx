"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errorMessage } from "@/lib/api";
import { ASSET_CATEGORIES, CATEGORY_LABEL, isCategory, type AssetCategory } from "@/lib/categories";
import type { Asset } from "@/lib/types";

export function EditAssetDialog({ asset, onClose }: { asset: Asset | null; onClose: () => void }) {
  return (
    <Dialog open={asset !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>{asset && <EditForm key={asset.id} asset={asset} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function EditForm({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(asset.title);
  const [artist, setArtist] = useState(asset.artist ?? "");
  const [category, setCategory] = useState<AssetCategory>(asset.category);

  const save = useMutation({
    mutationFn: () =>
      api<Asset>(`/stations/${asset.stationId}/assets/${asset.id}`, {
        method: "PATCH",
        body: { title: title.trim(), artist: artist.trim() || null, category },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets", asset.stationId] });
      toast.success("Cambios guardados");
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <DialogHeader>
        <DialogTitle>Editar audio</DialogTitle>
        <DialogDescription>Cambiá los datos con los que aparece en la programación y en el historial.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        <Label htmlFor="asset-title">Título</Label>
        <Input id="asset-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required autoFocus />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="asset-artist">Artista</Label>
        <Input id="asset-artist" value={artist} onChange={(event) => setArtist(event.target.value)} maxLength={200} placeholder="Opcional" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="asset-category">Categoría</Label>
        <Select value={category} onValueChange={(value) => isCategory(value) && setCategory(value)}>
          <SelectTrigger id="asset-category">
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

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" loading={save.isPending} disabled={!title.trim()}>
          Guardar
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DeleteAssetDialog({ asset, onClose }: { asset: Asset | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: (target: Asset) => api(`/stations/${target.stationId}/assets/${target.id}`, { method: "DELETE" }),
    onSuccess: (_data, target) => {
      queryClient.invalidateQueries({ queryKey: ["assets", target.stationId] });
      toast.success("Audio eliminado");
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Dialog open={asset !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Eliminar este audio?</DialogTitle>
          <DialogDescription>
            <strong className="font-medium text-foreground">{asset?.title}</strong> se quita de la biblioteca y de las campañas que lo
            usen. Las emisiones pasadas se conservan en el historial. Esta acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="destructive" loading={remove.isPending} onClick={() => asset && remove.mutate(asset)}>
            Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
