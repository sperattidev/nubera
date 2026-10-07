import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Equalizer } from "@/components/equalizer";
import { Logo } from "@/components/shell/logo";
import { getSessionUser } from "@/lib/server";
import { safeRedirect } from "@/lib/safe-redirect";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };
export const dynamic = "force-dynamic";

const HIGHLIGHTS = [
  "Un solo panel para la antena y el streaming",
  "Programación y publicidad que se arman solas",
  "Certificado de emisión para cada anunciante",
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getSessionUser()) {
    redirect(safeRedirect(next));
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden border-r border-border bg-sidebar p-12 lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 -top-24 size-[480px] rounded-full bg-primary/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 right-0 size-[420px] rounded-full bg-[#b18cff]/15 blur-3xl"
        />
        <Logo className="relative" />
        <div className="relative grid gap-8">
          <Equalizer className="h-16 w-40 text-primary" bars={14} />
          <h1 className="max-w-md text-4xl font-semibold leading-[1.1] tracking-tight">
            La radio, <span className="text-primary">siempre al aire</span>, sin depender del operador.
          </h1>
          <ul className="grid gap-3 text-[15px] text-muted-foreground">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span className="size-1.5 rounded-full bg-primary" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-muted-foreground">Nubera · automatización para radios FM, AM y digitales</p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <Logo className="mb-10 lg:hidden" />
          <h2 className="text-2xl font-semibold tracking-tight">Iniciar sesión</h2>
          <p className="mb-8 mt-1.5 text-sm text-muted-foreground">Ingresá con tu cuenta para acceder al panel.</p>
          <LoginForm next={safeRedirect(next)} />
        </div>
      </section>
    </div>
  );
}
