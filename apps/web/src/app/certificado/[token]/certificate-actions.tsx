"use client";

import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Descargar el detalle en CSV o imprimir / guardar como PDF desde el navegador. */
export function CertificateActions({ token }: { token: string }) {
  return (
    <div className="flex gap-2">
      <Button variant="outline" asChild>
        <a href={`/api/public/certificates/${token}?format=csv`} download>
          <Download /> Descargar CSV
        </a>
      </Button>
      <Button onClick={() => window.print()}>
        <Printer /> Imprimir o guardar PDF
      </Button>
    </div>
  );
}
