"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Plus, SearchX, ServerCog, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime, formatRelative } from "@/lib/format";
import { engineStatus, tokenEnvLine, tokenProblems, type AgentToken, type CreatedAgentToken } from "@/lib/settings";
import type { Station } from "@/lib/types";
import { useNow } from "@/lib/use-now";

const POLL_MS = 10_000;

export function EngineTab({ station }: { station: Station }) {
  const queryClient = useQueryClient();
  const now = useNow(5000);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<AgentToken | null>(null);

  const query = useQuery({
    queryKey: ["agent-tokens", station.id],
    queryFn: ({ signal }) => api<{ items: AgentToken[] }>(`/stations/${station.id}/agent-tokens`, { signal }),
    refetchInterval: POLL_MS,
  });
  const items = query.data?.items ?? [];

  const revoke = useMutation({
    mutationFn: (token: AgentToken) => api(`/stations/${station.id}/agent-tokens/${token.id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-tokens", station.id] });
      queryClient.invalidateQueries({ queryKey: ["on-air", station.id] });
      toast.success("Token revocado: el motor que lo usaba ya no puede conectarse");
      setRevoking(null);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div className="grid max-w-3xl gap-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Motor de audio de {station.name}</CardTitle>
            <CardDescription>
              El motor (Liquidsoap) corre en el estudio y se conecta a Nubera con un token propio de esta emisora. Cada token se puede revocar sin afectar a los demás.
            </CardDescription>
          </div>
          <Button onClick={() => setCreating(true)}>
            <Plus /> Nuevo token
          </Button>
        </CardHeader>
        <CardContent>
          {query.isPending ? (
            <Skeleton className="h-20 rounded-lg" />
          ) : query.isError ? (
            <EmptyState
              icon={SearchX}
              title="No se pudieron cargar los tokens"
              action={
                <Button variant="outline" onClick={() => query.refetch()}>
                  Reintentar
                </Button>
              }
            />
          ) : items.length === 0 ? (
            <EmptyState icon={ServerCog} title="Todavía no hay tokens" description="Creá uno para conectar el motor de audio de esta emisora." />
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {items.map((token) => {
                const status = engineStatus(token.lastSeenAt, now || Date.now());
                return (
                  <li key={token.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{token.name}</p>
                      <p className="text-xs text-muted-foreground">Creado {formatDateTime(token.createdAt, station.timezone)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {status === "online" && <Badge tone="success">Conectado</Badge>}
                      {status === "offline" && <Badge tone="warning">Sin conexión</Badge>}
                      {status === "never" && <Badge>Nunca se conectó</Badge>}
                      {token.lastSeenAt && <span className="text-xs text-muted-foreground">Última señal {formatRelative(token.lastSeenAt, now || Date.now(), station.timezone)}</span>}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setRevoking(token)} aria-label={`Revocar el token ${token.name}`}>
                      <Trash2 />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Cómo conectar el motor</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <ol className="grid list-decimal gap-2 pl-5 text-sm text-muted-foreground marker:text-primary">
            <li>Creá un token y copialo: se muestra una sola vez.</li>
            <li>
              Guardalo en el archivo <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">.env</code> del servidor del estudio como{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">NUBERA_AGENT_TOKEN</code>.
            </li>
            <li>Reiniciá el motor de audio. En unos segundos la fila de arriba pasa a &quot;Conectado&quot;.</li>
          </ol>
          <p className="mt-4 text-xs text-muted-foreground">Si sospechás que un token se filtró, revocalo y creá uno nuevo: el motor viejo deja de poder pedir audios de inmediato.</p>
        </CardContent>
      </Card>

      <CreateToken station={station} open={creating} onClose={() => setCreating(false)} />

      <Dialog open={revoking !== null} onOpenChange={(open) => !open && setRevoking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Revocar este token?</DialogTitle>
            <DialogDescription>
              El motor que use <strong className="font-medium text-foreground">{revoking?.name}</strong> dejará de recibir programación y la emisora pasará a su biblioteca de respaldo
              hasta que conectes otro con un token nuevo. No se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevoking(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" loading={revoke.isPending} onClick={() => revoking && revoke.mutate(revoking)}>
              Revocar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateToken({ station, open, onClose }: { station: Station; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-xl">{open && <CreateTokenForm station={station} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function CreateTokenForm({ station, onClose }: { station: Station; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [created, setCreated] = useState<CreatedAgentToken | null>(null);
  const problems = tokenProblems(name);

  const create = useMutation({
    mutationFn: () => api<CreatedAgentToken>(`/stations/${station.id}/agent-tokens`, { method: "POST", body: { name: name.trim() } }),
    onSuccess: (token) => {
      queryClient.invalidateQueries({ queryKey: ["agent-tokens", station.id] });
      setCreated(token);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (created) {
    const line = tokenEnvLine(created.token);
    return (
      <div className="grid gap-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-success" aria-hidden /> Token creado
          </DialogTitle>
          <DialogDescription>
            Copialo ahora: <strong className="font-medium text-foreground">no se vuelve a mostrar</strong>. Si lo perdés, revocalo y creá otro.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label>Para el archivo .env del servidor</Label>
          <pre className="overflow-x-auto rounded-lg border border-border bg-muted/50 p-3 font-mono text-[13px] leading-relaxed" aria-label="Línea para el archivo .env">
            {line}
          </pre>
          <div className="flex flex-wrap gap-2">
            <CopyButton value={line} label="Copiar línea del .env" size="md" />
            <CopyButton value={created.token} label="Copiar solo el token" size="md" variant="ghost" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Listo, ya lo guardé</Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        setAttempted(true);
        if (problems.length === 0) create.mutate();
      }}
    >
      <DialogHeader>
        <DialogTitle>Nuevo token del motor de audio</DialogTitle>
        <DialogDescription>Para {station.name}. El nombre sirve para reconocerlo después.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="token-name">Nombre</Label>
        <Input id="token-name" value={name} maxLength={80} placeholder="Ej.: Estudio principal" onChange={(event) => setName(event.target.value)} autoFocus />
        {attempted && problems.length > 0 && (
          <p role="alert" className="text-xs text-destructive">
            {problems[0]}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" loading={create.isPending}>
          Crear token
        </Button>
      </DialogFooter>
    </form>
  );
}
