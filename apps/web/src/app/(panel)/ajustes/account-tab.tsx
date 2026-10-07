"use client";

import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError, errorMessage, goToLogin } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/constants";
import { useSession } from "@/lib/session";
import { changePasswordProblems, passwordStrength, ROLE_OPTIONS } from "@/lib/settings";
import { cn } from "@/lib/utils";

export function AccountTab() {
  const { user } = useSession();
  const role = ROLE_OPTIONS.find((option) => option.id === user.role);

  return (
    <div className="grid max-w-2xl gap-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Tu cuenta</CardTitle>
            <CardDescription>Así figurás en el panel.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Nombre</dt>
              <dd className="mt-0.5 font-medium">{user.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Email</dt>
              <dd className="mt-0.5 break-all font-medium">{user.email}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Rol</dt>
              <dd className="mt-1 flex flex-wrap items-center gap-2">
                <Badge tone="brand">{ROLE_LABEL[user.role]}</Badge>
                <span className="text-[13px] text-muted-foreground">{role?.description}</span>
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <PasswordCard />
    </div>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const problems = changePasswordProblems({ current, next, confirm });
  const strength = passwordStrength(next);

  const change = useMutation({
    mutationFn: () =>
      api("/auth/password", { method: "POST", body: { currentPassword: current, newPassword: next }, allowUnauthorized: true }),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      setConfirm("");
      setAttempted(false);
      toast.success("Contraseña actualizada. Se cerraron tus otras sesiones.");
    },
    onError: (error) => {
      // La API responde 401 tanto si venció la sesión como si la contraseña actual es incorrecta.
      if (error instanceof ApiError && error.status === 401 && error.message === "Autenticación requerida") {
        goToLogin();
        return;
      }
      toast.error(errorMessage(error));
    },
  });

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Cambiar la contraseña</CardTitle>
          <CardDescription>Al cambiarla se cierran tus sesiones en otros dispositivos.</CardDescription>
        </div>
        <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            setAttempted(true);
            if (problems.length === 0) change.mutate();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="pw-current">Contraseña actual</Label>
            <Input id="pw-current" type={visible ? "text" : "password"} autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="pw-new">Contraseña nueva</Label>
              <button
                type="button"
                onClick={() => setVisible((value) => !value)}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                aria-pressed={visible}
              >
                {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                {visible ? "Ocultar" : "Mostrar"}
              </button>
            </div>
            <Input id="pw-new" type={visible ? "text" : "password"} autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} aria-describedby="pw-help" />
            <div className="flex items-center gap-3" id="pw-help">
              <div className="flex flex-1 gap-1" aria-hidden>
                {[1, 2, 3].map((step) => (
                  <span
                    key={step}
                    className={cn(
                      "h-1.5 flex-1 rounded-full bg-muted transition-colors",
                      strength.level >= step && (strength.level === 3 ? "bg-success" : strength.level === 2 ? "bg-primary" : "bg-warning"),
                    )}
                  />
                ))}
              </div>
              <span className="w-20 text-right text-xs text-muted-foreground">{strength.label || "Mínimo 12"}</span>
            </div>
            <p className="text-xs text-muted-foreground">Una frase larga es más segura y más fácil de recordar que una clave corta con símbolos.</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="pw-confirm">Repetí la contraseña nueva</Label>
            <Input id="pw-confirm" type={visible ? "text" : "password"} autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
          </div>

          {attempted && problems.length > 0 && (
            <div role="alert" className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <ul className="text-foreground/80">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          )}

          <Button type="submit" className="justify-self-start" loading={change.isPending}>
            Cambiar contraseña
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
