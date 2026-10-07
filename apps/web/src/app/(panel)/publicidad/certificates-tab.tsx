"use client";

import { localDate } from "@nubera/core";
import { useQuery } from "@tanstack/react-query";
import { Download, FileCheck2, Printer, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fillDays, formatDate, REPORT_PERIODS, reportRange, type AdReport, type Advertiser, type ReportPeriodId } from "@/lib/ads";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/** El certificado en pantalla muestra hasta esta cantidad de filas; el CSV las trae todas. */
const MAX_ROWS = 300;

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
        <div className="ml-auto flex gap-2">
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
        <Certificate report={report.data} stationName={stationName} timeZone={timeZone} advertiser={selected} />
      )}
    </div>
  );
}

function Certificate({ report, stationName, timeZone, advertiser }: { report: AdReport; stationName: string; timeZone: string; advertiser: Advertiser | undefined }) {
  const fromDate = localDate(new Date(report.from), timeZone);
  // `to` es exclusivo: el último día incluido es el del instante anterior.
  const toDate = localDate(new Date(new Date(report.to).getTime() - 1), timeZone);
  const days = useMemo(() => fillDays(report.perDay, fromDate, toDate), [report.perDay, fromDate, toDate]);
  const peak = Math.max(...days.map((day) => day.count), 1);
  const rows = report.items.slice(0, MAX_ROWS);

  return (
    <Card className="print-sheet overflow-hidden">
      <div className="grid gap-6 p-6 sm:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
          <div className="grid gap-1">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Certificado de emisión</p>
            <h2 className="text-2xl font-semibold tracking-tight">{report.advertiser.name}</h2>
            {advertiser?.industry && <p className="text-sm text-muted-foreground">{advertiser.industry}</p>}
          </div>
          <div className="text-right text-sm">
            <p className="font-medium">{stationName}</p>
            <p className="text-muted-foreground">
              {formatDate(fromDate)} a {formatDate(toDate)}
            </p>
          </div>
        </header>

        {report.total === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">En este período no salió al aire ningún aviso de este anunciante.</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat label="Emisiones en el período" value={report.total} />
              <Stat label="Campañas con emisiones" value={report.perCampaign.length} />
              <Stat label="Promedio por día" value={Math.round((report.total / days.length) * 10) / 10} />
            </div>

            <section className="grid gap-3" aria-label="Emisiones por día">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Emisiones por día</h3>
              <div className="flex h-28 items-end gap-px" role="img" aria-label={`Gráfico de emisiones por día, con un máximo de ${peak}`}>
                {days.map((day) => (
                  <div key={day.date} className="group relative flex h-full flex-1 items-end" title={`${formatDate(day.date)}: ${day.count}`}>
                    <div
                      className={cn("w-full rounded-t-sm", day.count === 0 ? "bg-muted" : "bg-primary")}
                      style={{ height: day.count === 0 ? "2px" : `${Math.max((day.count / peak) * 100, 4)}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
                <span>{formatDate(days[0]!.date)}</span>
                <span>máx. {peak} por día</span>
                <span>{formatDate(days[days.length - 1]!.date)}</span>
              </div>
            </section>

            {report.perCampaign.length > 0 && (
              <section className="grid gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Por campaña</h3>
                <ul className="grid gap-2">
                  {report.perCampaign.map((campaign) => (
                    <li key={campaign.campaignId} className="grid gap-1.5">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="truncate font-medium">{campaign.name}</span>
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">{campaign.count}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${(campaign.count / report.total) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="grid gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Detalle de emisiones</h3>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Fecha y hora</th>
                      <th className="px-3 py-2 font-medium">Campaña</th>
                      <th className="px-3 py-2 font-medium">Aviso</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((item) => (
                      <tr key={`${item.startedAt}-${item.campaignId}`}>
                        <td className="whitespace-nowrap px-3 py-1.5 font-mono tabular-nums text-muted-foreground">{item.localTime}</td>
                        <td className="px-3 py-1.5">{item.campaign}</td>
                        <td className="px-3 py-1.5">{item.spot}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(report.truncated || report.items.length > MAX_ROWS) && (
                <p className="text-xs text-muted-foreground">
                  Se muestran las primeras {rows.length} de {report.total.toLocaleString("es-AR")} emisiones. El archivo CSV incluye el detalle completo.
                </p>
              )}
            </section>
          </>
        )}

        <footer className="border-t border-border pt-4 text-xs text-muted-foreground">
          Emisiones confirmadas por el motor de audio de la emisora. Horarios en hora local ({timeZone.replace("_", " ")}). Generado el {formatDate(localDate(new Date(), timeZone))}.
        </footer>
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-3xl font-medium tabular-nums">{value.toLocaleString("es-AR")}</p>
    </div>
  );
}
