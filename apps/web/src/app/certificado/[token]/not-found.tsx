import { LogoMark } from "@/components/shell/logo";

export default function CertificateNotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="grid max-w-sm justify-items-center gap-4 text-center">
        <LogoMark className="size-12 rounded-2xl" />
        <h1 className="text-2xl font-semibold tracking-tight">Este certificado no está disponible</h1>
        <p className="text-sm text-muted-foreground">El enlace venció o fue desactivado. Pedile a la radio que te envíe uno nuevo.</p>
      </div>
    </main>
  );
}
