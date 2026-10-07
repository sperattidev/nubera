"use client";

import { localDate } from "@nubera/core";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { fillDays, formatDate } from "@/lib/ads";
import type { CertificateData } from "@/lib/certificate-links";
import { cn } from "@/lib/utils";

/** El certificado en pantalla muestra hasta esta cantidad de filas; el CSV las trae todas. */
const MAX_ROWS = 300;

/**
 * Certificado de emisión de un anunciante. Lo usan el panel y la página pública que se comparte
 * con el cliente, y se imprime tal cual (ver los estilos de impresión).
 */
export function CertificateSheet({
  report,
  stationName,
  timeZone,
  industry,
  generatedOn,
}: {
  report: CertificateData;
  stationName: string;
  timeZone: string;
  industry?: string | null;
  /** Día en que se generó, "2026-10-10"; sin dato se usa el de hoy en la emisora. */
  generatedOn?: string;
}) {
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
            {industry && <p className="text-sm text-muted-foreground">{industry}</p>}
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
                  {report.perCampaign.map((campaign, index) => (
                    <li key={`${index}-${campaign.name}`} className="grid gap-1.5">
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
                    {rows.map((item, index) => (
                      <tr key={`${index}-${item.startedAt}`}>
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
          Emisiones confirmadas por el motor de audio de la emisora. Horarios en hora local ({timeZone.replace("_", " ")}). Generado el{" "}
          {formatDate(generatedOn ?? localDate(new Date(), timeZone))}.
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
