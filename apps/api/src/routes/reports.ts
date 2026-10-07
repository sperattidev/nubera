import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { Database } from "@nubera/db";
import { HttpError } from "../errors.js";
import { assertValidRange, loadAdvertiserReport, reportCsv } from "../reports/advertiser-report.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const params = z.object({ advertiserId: z.string().uuid() });
const query = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  stationId: z.string().uuid().optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

interface Options {
  db: Database;
  now: () => Date;
}

export const reportRoutes: FastifyPluginAsync<Options> = async (app, { db, now }) => {
  // Certificado de emisión (as-run): cada aviso del anunciante que efectivamente salió al aire.
  app.get("/advertisers/:advertiserId/report", { preHandler: app.authorize("ads:read") }, async (request, reply) => {
    const { advertiserId } = params.parse(request.params);
    const { from: fromParam, to: toParam, stationId, format } = query.parse(request.query);

    const to = toParam ?? now();
    const from = fromParam ?? new Date(to.getTime() - 30 * DAY_MS);
    assertValidRange(from, to);

    const report = await loadAdvertiserReport(db, { advertiserId, tenantId: request.user!.tenantId, from, to, stationId });
    if (!report) {
      throw new HttpError(404, "Anunciante no encontrado");
    }

    if (format === "csv") {
      const { filename, body } = reportCsv(report, from, to);
      return reply
        .header("content-type", "text/csv; charset=utf-8")
        .header("content-disposition", `attachment; filename="${filename}"`)
        .send(body);
    }

    return {
      advertiser: report.advertiser,
      from,
      to,
      total: report.items.length,
      truncated: report.truncated,
      perDay: report.perDay,
      perCampaign: report.perCampaign,
      items: report.items.map(({ date: _date, ...item }) => item),
    };
  });
};
