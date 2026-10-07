"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, FileCheck2, Printer, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { CertificateSheet } from "@/components/ads/certificate-sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { REPORT_PERIODS, reportRange, type AdReport, type Advertiser, type ReportPeriodId } from "@/lib/ads";
import { api } from "@/lib/api";
import { ShareCertificate } from "./share-certificate";

export function CertificatesTab({
  stationId,
  stationName,
  timeZone,
  advertisers,
}: {
  stationId: string;
  stationName: string;
  timeZone: string;
  advertisers: Advertiser[];
}) {
  // Hasta que el usuario elija, se usa el primero de la lista (que puede llegar después de abrir la pestaña).
  const [chosen, setChosen] = useState("");
  const advertiserId = advertisers.some((advertiser) => advertiser.id === chosen) ? chosen : (advertisers[0]?.id ?? "");
  const [period, setPeriod] = useState<ReportPeriodId>("30d");

  // El período se fija al elegirlo: recalcularlo en cada render cambiaría la consulta sin parar.
  const range = useMemo(() => reportRange(period, new Date(), timeZone), [period, timeZone]);
  const search = useMemo(() => {
    const params = new URLSearchParams({ stationId, from: range.from.toISOString() });
    if (range.to) params.set("to", range.to.toISOString());
    return params;
  }, [stationId, range]);

  const selected = advertisers.find((advertiser) => advertiser.id === advertiserId);

  const report = useQuery({
    queryKey: ["ad-report", stationId, advertiserId, period, range.from.toISOString()],
    queryFn: ({ signal }) => api<AdReport>(`/advertisers/${advertiserId}/report?${search}`, { signal }),
    enabled: advertiserId !== "",
  });

  if (advertisers.length === 0) {
    return (
      <Card>
        <EmptyState icon={FileCheck2} title="Todavía no hay anunciantes" description="Cuando cargues anunciantes y salgan sus avisos al aire, vas a poder emitir su certificado acá." />
      </Card>
    );
  }

  const csvUrl = `/api/advertisers/${advertiserId}/report?${new URLSearchParams({ ...Object.fromEntries(search), format: "csv" })}`;

  return (
    <div className="grid gap-5">
      <div className="no-print flex flex-wrap items-end gap-4">
        <div className="grid min-w-56 gap-2">
          <Label htmlFor="report-advertiser">Anunciante</Label>
          <Select value={advertiserId} onValueChange={setChosen}>
            <SelectTrigger id="report-advertiser">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {advertisers.map((advertiser) => (
                <SelectItem key={advertiser.id} value={advertiser.id}>
                  {advertiser.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid min-w-48 gap-2">
          <Label htmlFor="report-period">Período</Label>
          <Select value={period} onValueChange={(value) => setPeriod(value as ReportPeriodId)}>
            <SelectTrigger id="report-period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REPORT_PERIODS.map(({ id, label }) => (
                <SelectItem key={id} value={id}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {selected && <ShareCertificate stationId={stationId} advertiser={selected} range={range} timeZone={timeZone} />}
          <Button variant="outline" asChild>
            <a href={csvUrl} download>
              <Download /> Descargar CSV
            </a>
          </Button>
          <Button onClick={() => window.print()} disabled={!report.data}>
            <Printer /> Imprimir o guardar PDF
          </Button>
        </div>
      </div>

      {report.isPending ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : report.isError ? (
        <Card>
          <EmptyState
            icon={SearchX}
            title="No se pudo generar el certificado"
            action={
              <Button variant="outline" onClick={() => report.refetch()}>
                Reintentar
              </Button>
            }
          />
        </Card>
      ) : (
        <CertificateSheet report={report.data} stationName={stationName} timeZone={timeZone} industry={selected?.industry} />
      )}
    </div>
  );
}
