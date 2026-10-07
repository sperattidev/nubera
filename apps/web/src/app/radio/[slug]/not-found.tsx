import { LogoMark } from "@/components/shell/logo";

export default function RadioNotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="grid max-w-sm justify-items-center gap-4 text-center">
        <LogoMark className="size-12 rounded-2xl" />
        <h1 className="text-2xl font-semibold tracking-tight">No encontramos esa radio</h1>
        <p className="text-sm text-muted-foreground">Revisá que la dirección esté bien escrita. Si te la pasaron hace tiempo, puede que haya cambiado.</p>
      </div>
    </main>
  );
}
