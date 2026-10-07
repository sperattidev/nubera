"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Dices, Eye, EyeOff, KeyRound, MoreHorizontal, Pencil, Plus, SearchX, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api, errorMessage } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import {
  emptyUserForm,
  generatePassword,
  newUserPayload,
  newUserProblems,
  passwordProblems,
  ROLE_OPTIONS,
  type NewUserForm,
  type TeamUser,
} from "@/lib/settings";
import { cn } from "@/lib/utils";

type Target = { kind: "create" } | { kind: "edit"; user: TeamUser } | { kind: "password"; user: TeamUser };

export function TeamTab({ timeZone }: { timeZone: string }) {
  const { user: me } = useSession();
  const [target, setTarget] = useState<Target | null>(null);
  const query = useQuery({
    queryKey: ["team"],
    queryFn: ({ signal }) => api<{ items: TeamUser[] }>("/users", { signal }),
  });
  const items = query.data?.items ?? [];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Las personas que pueden entrar al panel y qué puede hacer cada una.</p>
        <Button onClick={() => setTarget({ kind: "create" })}>
          <Plus /> Nuevo usuario
        </Button>
      </div>

      <Card className="overflow-hidden">
        {query.isPending ? (
          <div className="divide-y divide-border" aria-busy>
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex items-center gap-4 px-4 py-4">
                <Skeleton className="size-9 rounded-full" />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="ml-auto h-5 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : query.isError ? (
          <EmptyState
            icon={SearchX}
            title="No se pudo cargar el equipo"
            action={
              <Button variant="outline" onClick={() => query.refetch()}>
                Reintentar
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState icon={Users} title="Todavía no hay usuarios" />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((person) => (
              <li key={person.id} className={cn("flex items-center gap-4 px-4 py-3.5", !person.isActive && "opacity-60")}>
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-[13px] font-semibold text-accent-foreground" aria-hidden>
                  {person.name
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part[0]?.toUpperCase())
                    .join("")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-medium">
                    {person.name}
                    {person.id === me.id && <span className="text-xs font-normal text-muted-foreground">(vos)</span>}
                  </p>
                  <p className="truncate text-[13px] text-muted-foreground">{person.email}</p>
                </div>
                <span className="hidden text-xs text-muted-foreground lg:block">Alta {formatDateTime(person.createdAt, timeZone)}</span>
                <Badge tone={person.role === "owner" ? "brand" : "neutral"} className="hidden sm:inline-flex">
                  {ROLE_LABEL[person.role]}
                </Badge>
                {!person.isActive && <Badge tone="warning">Inactivo</Badge>}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Acciones de ${person.name}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setTarget({ kind: "edit", user: person })}>
                      <Pencil /> Editar
                    </DropdownMenuItem>
                    {person.id !== me.id && (
                      <DropdownMenuItem onSelect={() => setTarget({ kind: "password", user: person })}>
                        <KeyRound /> Restablecer contraseña
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          {target?.kind === "create" && <CreateUser onClose={() => setTarget(null)} />}
          {target?.kind === "edit" && <EditUser key={target.user.id} person={target.user} isMe={target.user.id === me.id} onClose={() => setTarget(null)} />}
          {target?.kind === "password" && <ResetPassword key={target.user.id} person={target.user} onClose={() => setTarget(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Contraseña con "generar", ver y copiar: la persona no la recupera después, hay que pasársela. */
function PasswordInput({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="grid gap-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input id={id} type={visible ? "text" : "password"} autoComplete="new-password" value={value} onChange={(event) => onChange(event.target.value)} className="pr-10 font-mono" spellCheck={false} />
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground transition-colors hover:text-foreground"
            aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            onChange(generatePassword());
            setVisible(true);
          }}
        >
          <Dices /> Generar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Mínimo 12 caracteres. Pasásela a la persona por un medio seguro; después puede cambiarla desde Mi cuenta.</p>
    </div>
  );
}

function Problems({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div role="alert" className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <ul className="text-foreground/80">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/** Pantalla final con los datos de acceso, que no se vuelven a mostrar. */
function Credentials({ title, email, password, onClose }: { title: string; email: string; password: string; onClose: () => void }) {
  const text = `Email: ${email}\nContraseña: ${password}`;
  return (
    <div className="grid gap-5">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-success" aria-hidden /> {title}
        </DialogTitle>
        <DialogDescription>Copiá estos datos y pasáselos a la persona. La contraseña no se vuelve a mostrar.</DialogDescription>
      </DialogHeader>
      <dl className="grid gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Email</dt>
          <dd className="mt-0.5 break-all font-mono">{email}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Contraseña</dt>
          <dd className="mt-0.5 break-all font-mono">{password}</dd>
        </div>
      </dl>
      <DialogFooter>
        <CopyButton value={text} label="Copiar datos de acceso" size="md" />
        <Button onClick={onClose}>Listo</Button>
      </DialogFooter>
    </div>
  );
}

function CreateUser({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<NewUserForm>(emptyUserForm);
  const [attempted, setAttempted] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const set = <K extends keyof NewUserForm>(key: K, value: NewUserForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const problems = newUserProblems(form);

  const create = useMutation({
    mutationFn: () => api<TeamUser>("/users", { method: "POST", body: newUserPayload(form) }),
    onSuccess: (user) => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
      setCreated({ email: user.email, password: form.password });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (created) {
    return <Credentials title="Usuario creado" email={created.email} password={created.password} onClose={onClose} />;
  }

  const role = ROLE_OPTIONS.find((option) => option.id === form.role);
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
        <DialogTitle>Nuevo usuario</DialogTitle>
        <DialogDescription>Crea la cuenta con una contraseña inicial para que la persona pueda entrar.</DialogDescription>
      </DialogHeader>
      <fieldset disabled={create.isPending} className="grid min-w-0 gap-4 border-0 p-0">
        <div className="grid gap-2">
          <Label htmlFor="new-name">Nombre</Label>
          <Input id="new-name" value={form.name} maxLength={120} onChange={(event) => set("name", event.target.value)} autoFocus />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="new-email">Email</Label>
          <Input id="new-email" type="email" autoComplete="off" value={form.email} onChange={(event) => set("email", event.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="new-role">Rol</Label>
          <RoleSelect id="new-role" value={form.role} onChange={(value) => set("role", value)} />
          <p className="text-xs text-muted-foreground">{role?.description}</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="new-password">Contraseña inicial</Label>
          <PasswordInput id="new-password" value={form.password} onChange={(value) => set("password", value)} />
        </div>
      </fieldset>
      {attempted && <Problems items={problems} />}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" loading={create.isPending}>
          Crear usuario
        </Button>
      </DialogFooter>
    </form>
  );
}

function RoleSelect({ id, value, onChange, disabled }: { id: string; value: TeamUser["role"]; onChange: (value: TeamUser["role"]) => void; disabled?: boolean }) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as TeamUser["role"])} disabled={disabled}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLE_OPTIONS.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function EditUser({ person, isMe, onClose }: { person: TeamUser; isMe: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(person.name);
  const [role, setRole] = useState(person.role);
  const [isActive, setIsActive] = useState(person.isActive);

  const save = useMutation({
    mutationFn: () => api<TeamUser>(`/users/${person.id}`, { method: "PATCH", body: { name: name.trim(), role, isActive } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
      toast.success(!isActive && person.isActive ? `${person.name} fue desactivado y se cerraron sus sesiones` : "Cambios guardados");
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) save.mutate();
      }}
    >
      <DialogHeader>
        <DialogTitle>Editar usuario</DialogTitle>
        <DialogDescription className="break-all">{person.email}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="edit-name">Nombre</Label>
        <Input id="edit-name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} autoFocus />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="edit-role">Rol</Label>
        <RoleSelect id="edit-role" value={role} onChange={setRole} disabled={isMe} />
        <p className="text-xs text-muted-foreground">{ROLE_OPTIONS.find((option) => option.id === role)?.description}</p>
      </div>
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/40 px-4 py-3">
        <div>
          <Label htmlFor="edit-active">Cuenta activa</Label>
          <p className="text-xs text-muted-foreground">Al desactivarla se cierran sus sesiones y no puede volver a entrar.</p>
        </div>
        <Switch id="edit-active" checked={isActive} onCheckedChange={setIsActive} disabled={isMe} />
      </div>
      {isMe && <p className="text-xs text-muted-foreground">No podés cambiar tu propio rol ni desactivar tu cuenta: así el cliente siempre conserva un dueño activo.</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" loading={save.isPending} disabled={!name.trim()}>
          Guardar cambios
        </Button>
      </DialogFooter>
    </form>
  );
}

function ResetPassword({ person, onClose }: { person: TeamUser; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const problems = passwordProblems(password);

  const reset = useMutation({
    mutationFn: () => api(`/users/${person.id}/password`, { method: "POST", body: { password } }),
    onSuccess: () => setDone(password),
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (done) {
    return <Credentials title="Contraseña restablecida" email={person.email} password={done} onClose={onClose} />;
  }

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        setAttempted(true);
        if (problems.length === 0) reset.mutate();
      }}
    >
      <DialogHeader>
        <DialogTitle>Restablecer contraseña</DialogTitle>
        <DialogDescription>
          Definís una contraseña nueva para <strong className="font-medium text-foreground">{person.name}</strong>. Se cierran todas sus sesiones abiertas.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="reset-password">Contraseña nueva</Label>
        <PasswordInput id="reset-password" value={password} onChange={setPassword} />
      </div>
      {attempted && <Problems items={problems} />}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" loading={reset.isPending}>
          Restablecer
        </Button>
      </DialogFooter>
    </form>
  );
}
