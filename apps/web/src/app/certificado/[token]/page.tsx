import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CertificateSheet } from "@/components/ads/certificate-sheet";
import { formatDate } from "@/lib/ads";
import { getPublicCertificate } from "@/lib/public-certificate";
import { localDate } from "@nubera/core";
import { CertificateActions } from "./certificate-actions";

type Props = { params: Promise<{ token: string }> };

// El enlace es privado: no se indexa y no se reenvía en el encabezado Referer.
export const metadata: Metadata = {
  title: "Certificado de emisión",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function CertificatePage({ params }: Props) {
  const { token } = await params;
  const certificate = await getPublicCertificate(token);
  if (!certificate) {
    notFound();
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Este enlace vence el {formatDate(localDate(new Date(certificate.expiresAt), certificate.station.timezone))}.
        </p>
        <CertificateActions token={token} />
      </div>
      <CertificateSheet
        report={certificate}
        stationName={certificate.station.name}
        timeZone={certificate.station.timezone}
        generatedOn={certificate.generatedOn}
      />
    </main>
  );
}
