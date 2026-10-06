"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Library, MoreHorizontal, Pause, Pencil, Play, Search, SearchX, Trash2, Upload } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Equalizer } from "@/components/equalizer";
import { CategoryBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState, PageHeader } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Hint } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { useAudioPlayer } from "@/lib/audio-player";
import { ASSET_CATEGORIES, CATEGORY_LABEL, isCategory, type AssetCategory } from "@/lib/categories";
import { formatBytes, formatDateTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { Asset, AssetPage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DeleteAssetDialog, EditAssetDialog } from "./asset-dialogs";
import { UploadDialog } from "./upload-dialog";

const PAGE_SIZE = 25;

/** Filtros y página en la URL: se pueden compartir, y "atrás" funciona como se espera. */
function useLibraryParams() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const rawCategory = searchParams.get("categoria");
  const state = {
    q: searchParams.get("q") ?? "",
    category: isCategory(rawCategory) ? rawCategory : null,
    page: Math.max(1, Number(searchParams.get("pagina")) || 1),
  };

  function update(changes: Partial<typeof state>) {
    const next = { ...state, ...changes };
    const params = new URLSearchParams();
    if (next.q) params.set("q", next.q);
    if (next.category) params.set("categoria", next.category);
    if (next.page > 1) params.set("pagina", String(next.page));
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return { ...state, update };
}

export function LibraryView() {
  const { station } = useSession();
  if (!station) {
    return (
      <>
        <PageHeader title="Biblioteca" />
        <Card>
          <EmptyState icon={Library} title="Todavía no hay emisoras" description="La biblioteca se organiza por emisora." />
        </Card>
      </>
    );
  }
  return <LibraryContent stationId={station.id} timezone={station.timezone} />;
}

function LibraryContent({ stationId, timezone }: { stationId: string; timezone: string }) {
  const { allowed } = useSession();
  const canWrite = allowed("assets:write");
  const { q, category, page, update } = useLibraryParams();

  const [search, setSearch] = useState(q);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [deleting, setDeleting] = useState<Asset | null>(null);

  // La búsqueda se aplica al dejar de escribir.
  useEffect(() => {
    if (search === q) return;
    const timer = setTimeout(() => update({ q: search.trim(), page: 1 }), 300);
    return () => clearTimeout(timer);
  }, [search]); // `q` y `update` cambian con la URL: solo importa lo que escribe el usuario.

  const query = useQuery({
    queryKey: ["assets", stationId, { q, category, page }],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE) });
      if (q) params.set("q", q);
      if (category) params.set("category", category);
      return api<AssetPage>(`/stations/${stationId}/assets?${params}`, { signal });
    },
    placeholderData: keepPreviousData,
  });

  const data = query.data;
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtering = q !== "" || category !== null;

  return (
    <>
      <PageHeader
        title="Biblioteca"
        description={data ? `${total.toLocaleString("es-AR")} ${total === 1 ? "audio" : "audios"}${filtering ? " con estos filtros" : ""}` : "Cargando…"}
        actions={
          canWrite && (
            <Button onClick={() => setUploadOpen(true)}>
              <Upload /> Subir audios
            </Button>
          )
        }
      />

      <div className="mb-4 grid gap-3">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por título o artista"
            className="pl-9"
            aria-label="Buscar en la biblioteca"
          />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por categoría">
          {[null, ...ASSET_CATEGORIES].map((value) => (
            <button
              key={value ?? "all"}
              type="button"
              aria-pressed={category === value}
              onClick={() => update({ category: value as AssetCategory | null, page: 1 })}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                category === value
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border bg-card/60 text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {value ? CATEGORY_LABEL[value] : "Todas"}
            </button>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden">
        {query.isPending ? (
          <TableSkeleton />
        ) : query.isError && !data ? (
          <EmptyState
            icon={SearchX}
            title="No se pudo cargar la biblioteca"
            action={
              <Button variant="outline" onClick={() => query.refetch()}>
                Reintentar
              </Button>
            }
          />
        ) : data && data.items.length === 0 ? (
          filtering ? (
            <EmptyState
              icon={SearchX}
              title="Sin resultados"
              description="Ningún audio coincide con la búsqueda. Probá con otras palabras o quitá los filtros."
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch("");
                    update({ q: "", category: null, page: 1 });
                  }}
                >
                  Quitar filtros
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Library}
              title="La biblioteca está vacía"
              description="Subí la música, los jingles y los avisos que la programación va a usar."
              action={
                canWrite && (
                  <Button onClick={() => setUploadOpen(true)}>
                    <Upload /> Subir audios
                  </Button>
                )
              }
            />
          )
        ) : (
          <div className={cn("overflow-x-auto transition-opacity", query.isPlaceholderData && "opacity-60")}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="w-14 px-4 py-3" />
                  <th className="px-2 py-3 font-medium">Título</th>
                  <th className="hidden px-3 py-3 font-medium md:table-cell">Categoría</th>
                  <th className="hidden px-3 py-3 text-right font-medium lg:table-cell">Tamaño</th>
                  <th className="hidden px-3 py-3 font-medium lg:table-cell">Agregado</th>
                  {canWrite && <th className="w-12 px-3 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data?.items.map((asset) => (
                  <AssetRow
                    key={asset.id}
                    asset={asset}
                    timezone={timezone}
                    canWrite={canWrite}
                    onEdit={() => setEditing(asset)}
                    onDelete={() => setDeleting(asset)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.items.length > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-[13px] text-muted-foreground">
            <span>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de {total.toLocaleString("es-AR")}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" disabled={page <= 1} onClick={() => update({ page: page - 1 })} aria-label="Página anterior">
                <ChevronLeft />
              </Button>
              <span className="min-w-16 text-center tabular-nums">
                {page} / {pages}
              </span>
              <Button variant="ghost" size="icon" disabled={page >= pages} onClick={() => update({ page: page + 1 })} aria-label="Página siguiente">
                <ChevronRight />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {canWrite && <UploadDialog stationId={stationId} open={uploadOpen} onOpenChange={setUploadOpen} />}
      <EditAssetDialog asset={editing} onClose={() => setEditing(null)} />
      <DeleteAssetDialog asset={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}

function AssetRow({
  asset,
  timezone,
  canWrite,
  onEdit,
  onDelete,
}: {
  asset: Asset;
  timezone: string;
  canWrite: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { track, playing, play } = useAudioPlayer();
  const current = track?.id === asset.id;
  const active = current && playing;

  return (
    <tr className={cn("transition-colors hover:bg-accent/40", current && "bg-primary/5")}>
      <td className="px-4 py-2.5">
        <Hint label={active ? "Pausar" : "Escuchar"}>
          <Button
            variant={current ? "primary" : "secondary"}
            size="icon"
            className="size-9 rounded-full"
            onClick={() => play({ id: asset.id, stationId: asset.stationId, title: asset.title, artist: asset.artist })}
            aria-label={`${active ? "Pausar" : "Escuchar"} ${asset.title}`}
          >
            {active ? <Pause /> : <Play />}
          </Button>
        </Hint>
      </td>
      <td className="max-w-0 px-2 py-2.5">
        <div className="flex items-center gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{asset.title}</p>
            <p className="truncate text-[13px] text-muted-foreground">
              {asset.artist ?? "Sin artista"}
              <span className="md:hidden"> · {CATEGORY_LABEL[asset.category]}</span>
            </p>
          </div>
          {active && <Equalizer bars={4} className="h-4 w-5 shrink-0 text-primary" />}
        </div>
      </td>
      <td className="hidden px-3 py-2.5 md:table-cell">
        <CategoryBadge category={asset.category} />
      </td>
      <td className="hidden px-3 py-2.5 text-right font-mono text-xs tabular-nums text-muted-foreground lg:table-cell">
        {formatBytes(asset.sizeBytes)}
      </td>
      <td className="hidden whitespace-nowrap px-3 py-2.5 text-[13px] text-muted-foreground lg:table-cell">
        {formatDateTime(asset.createdAt, timezone)}
      </td>
      {canWrite && (
        <td className="px-3 py-2.5 text-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Acciones de ${asset.title}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil /> Editar
              </DropdownMenuItem>
              <DropdownMenuItem destructive onSelect={onDelete}>
                <Trash2 /> Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      )}
    </tr>
  );
}

function TableSkeleton() {
  return (
    <div className="divide-y divide-border" aria-busy>
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="flex items-center gap-4 px-4 py-3.5">
          <Skeleton className="size-9 rounded-full" />
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="hidden h-5 w-20 rounded-full md:block" />
        </div>
      ))}
    </div>
  );
}
