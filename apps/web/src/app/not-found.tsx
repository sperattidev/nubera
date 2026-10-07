import Link from "next/link";
import { LogoMark } from "@/components/shell/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="grid max-w-sm justify-items-center gap-4 text-center">
        <LogoMark className="size-12 rounded-2xl" />
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">Esta página no existe</h1>
        <p className="text-sm text-muted-foreground">Puede que el enlace esté mal escrito o que la página se haya movido.</p>
        <Button asChild>
          <Link href="/aire">Volver al panel</Link>
        </Button>
      </div>
    </main>
  );
}
