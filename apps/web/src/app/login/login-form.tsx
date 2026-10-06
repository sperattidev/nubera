"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api("/auth/login", { method: "POST", body: { email, password }, allowUnauthorized: true });
      router.replace(next);
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        setError("El email o la contraseña no son correctos.");
      } else if (cause instanceof ApiError && cause.status === 429) {
        setError("Demasiados intentos. Esperá un minuto y probá de nuevo.");
      } else {
        setError(cause instanceof Error ? cause.message : "No se pudo iniciar sesión.");
      }
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          autoFocus
          required
          placeholder="vos@tuaradio.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={error ? true : undefined}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password">Contraseña</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className="pr-10"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={error ? true : undefined}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground transition-colors hover:text-foreground"
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" loading={submitting} disabled={!email || !password}>
        Ingresar
      </Button>
    </form>
  );
}
