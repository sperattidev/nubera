import { describe, expect, it } from "vitest";
import {
  addDays,
  advertiserPayload,
  advertiserProblems,
  campaignPayload,
  campaignProblems,
  campaignStatus,
  campaignToForm,
  daysBetween,
  emptyAdvertiserForm,
  fillDays,
  flightCaption,
  flightProgress,
  formatDate,
  newCampaignForm,
  reportRange,
  type Campaign,
  type CampaignForm,
} from "./ads";

const TZ = "America/Argentina/Buenos_Aires";

const campaign = (overrides: Partial<Campaign> = {}): Campaign => ({
  id: "c1",
  advertiserId: "a1",
  advertiserName: "Supermercado Sur",
  name: "Octubre",
  startsOn: "2026-10-01",
  endsOn: "2026-10-31",
  dailyPlays: null,
  weight: 1,
  days: [1, 2, 3, 4, 5, 6, 7],
  start: "00:00",
  end: "24:00",
  isActive: true,
  assets: [{ id: "s1", title: "Spot 1" }],
  ...overrides,
});

describe("fechas", () => {
  it("suma días y cruza meses y años", () => {
    expect(addDays("2026-10-06", 29)).toBe("2026-11-04");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("cuenta los días entre fechas", () => {
    expect(daysBetween("2026-10-01", "2026-10-31")).toBe(30);
    expect(daysBetween("2026-10-06", "2026-10-06")).toBe(0);
    expect(daysBetween("2026-10-06", "2026-10-01")).toBe(-5);
  });

  it("da formato legible", () => {
    expect(formatDate("2026-10-06")).toBe("6 oct 2026");
  });
});

describe("estado de una campaña", () => {
  const today = "2026-10-15";

  it("vigente, programada y finalizada según la fecha", () => {
    expect(campaignStatus(campaign(), today)).toBe("active");
    expect(campaignStatus(campaign({ startsOn: "2026-10-16" }), today)).toBe("scheduled");
    expect(campaignStatus(campaign({ endsOn: "2026-10-14" }), today)).toBe("ended");
  });

  it("los extremos de la vigencia son inclusivos", () => {
    expect(campaignStatus(campaign({ startsOn: today }), today)).toBe("active");
    expect(campaignStatus(campaign({ endsOn: today }), today)).toBe("active");
  });

  it("pausada solo si todavía puede salir al aire", () => {
    expect(campaignStatus(campaign({ isActive: false }), today)).toBe("paused");
    expect(campaignStatus(campaign({ isActive: false, startsOn: "2026-11-01", endsOn: "2026-11-30" }), today)).toBe("paused");
    expect(campaignStatus(campaign({ isActive: false, endsOn: "2026-10-14" }), today)).toBe("ended");
  });
});

describe("avance de una campaña", () => {
  const flight = { startsOn: "2026-10-01", endsOn: "2026-10-10" };

  it("va de 0 a 1 y se mantiene en los extremos", () => {
    expect(flightProgress(flight, "2026-09-20")).toBe(0);
    expect(flightProgress(flight, "2026-10-01")).toBeCloseTo(0.1);
    expect(flightProgress(flight, "2026-10-05")).toBeCloseTo(0.5);
    expect(flightProgress(flight, "2026-10-10")).toBe(1);
    expect(flightProgress(flight, "2026-12-01")).toBe(1);
  });

  it("describe cuánto falta", () => {
    expect(flightCaption(flight, "2026-09-28")).toBe("Empieza en 3 días");
    expect(flightCaption(flight, "2026-09-30")).toBe("Empieza en 1 día");
    expect(flightCaption(flight, "2026-10-04")).toBe("Faltan 6 días");
    expect(flightCaption(flight, "2026-10-09")).toBe("Faltan 1 día");
    expect(flightCaption(flight, "2026-10-10")).toBe("Termina hoy");
    expect(flightCaption(flight, "2026-10-12")).toBe("Terminó hace 2 días");
  });
});

describe("formulario de campaña", () => {
  it("una campaña nueva dura 30 días, todos los días y sin tope", () => {
    const form = newCampaignForm("2026-10-06", "a1");
    expect(form).toMatchObject({ advertiserId: "a1", startsOn: "2026-10-06", endsOn: "2026-11-04", start: "00:00", end: "24:00", limitDaily: false, isActive: true });
    expect(form.days).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("ida y vuelta entre campaña, formulario y cuerpo de la API", () => {
    const original = campaign({ dailyPlays: 12, weight: 3, days: [5, 1, 3], assets: [{ id: "s1", title: "a" }, { id: "s2", title: "b" }] });
    expect(campaignPayload(campaignToForm(original))).toEqual({
      advertiserId: "a1",
      name: "Octubre",
      startsOn: "2026-10-01",
      endsOn: "2026-10-31",
      dailyPlays: 12,
      weight: 3,
      days: [1, 3, 5],
      start: "00:00",
      end: "24:00",
      assetIds: ["s1", "s2"],
      isActive: true,
    });
  });

  it("sin tope diario, se envía null", () => {
    expect(campaignPayload(campaignToForm(campaign({ dailyPlays: null }))).dailyPlays).toBeNull();
    expect(campaignPayload({ ...campaignToForm(campaign({ dailyPlays: 5 })), limitDaily: false }).dailyPlays).toBeNull();
  });

  describe("campaignProblems", () => {
    const valid = (): CampaignForm => ({ ...campaignToForm(campaign()), name: "Octubre" });

    it("una campaña correcta no tiene problemas", () => {
      expect(campaignProblems(valid())).toEqual([]);
    });

    it("exige anunciante, nombre y avisos", () => {
      expect(campaignProblems({ ...valid(), advertiserId: "" })).toContain("Elegí el anunciante.");
      expect(campaignProblems({ ...valid(), name: " " })).toContain("Poné un nombre a la campaña.");
      expect(campaignProblems({ ...valid(), assetIds: [] })).toContain("Elegí al menos un aviso.");
      expect(campaignProblems({ ...valid(), assetIds: Array.from({ length: 21 }, (_, i) => `s${i}`) })).toContain("Una campaña admite hasta 20 avisos.");
    });

    it("valida fechas, días y franja horaria", () => {
      expect(campaignProblems({ ...valid(), endsOn: "2026-09-30" })).toContain("La campaña no puede terminar antes de empezar.");
      expect(campaignProblems({ ...valid(), startsOn: "" }).join(" ")).toMatch(/fechas/);
      expect(campaignProblems({ ...valid(), startsOn: "2026-13-45" }).join(" ")).toMatch(/fechas/);
      expect(campaignProblems({ ...valid(), startsOn: "2026-10-31", endsOn: "2026-10-31" })).toEqual([]);
      expect(campaignProblems({ ...valid(), days: [] })).toContain("Elegí al menos un día.");
      expect(campaignProblems({ ...valid(), start: "20:00", end: "08:00" }).join(" ")).toMatch(/posterior al inicio/);
    });

    it("valida peso y tope diario (el tope solo si está activado)", () => {
      expect(campaignProblems({ ...valid(), weight: 0 }).join(" ")).toMatch(/peso/);
      expect(campaignProblems({ ...valid(), weight: 101 }).join(" ")).toMatch(/peso/);
      expect(campaignProblems({ ...valid(), limitDaily: true, dailyPlays: 0 }).join(" ")).toMatch(/tope/);
      expect(campaignProblems({ ...valid(), limitDaily: true, dailyPlays: 1001 }).join(" ")).toMatch(/tope/);
      expect(campaignProblems({ ...valid(), limitDaily: false, dailyPlays: 0 })).toEqual([]);
    });
  });
});

describe("formulario de anunciante", () => {
  it("exige el nombre y valida el email solo si se completó", () => {
    expect(advertiserProblems(emptyAdvertiserForm())).toEqual(["Poné el nombre del anunciante."]);
    expect(advertiserProblems({ ...emptyAdvertiserForm(), name: "Sur" })).toEqual([]);
    expect(advertiserProblems({ ...emptyAdvertiserForm(), name: "Sur", contactEmail: "no-es-email" })).toEqual(["El email de contacto no es válido."]);
    expect(advertiserProblems({ ...emptyAdvertiserForm(), name: "Sur", contactEmail: "compras@sur.com" })).toEqual([]);
  });

  it("recorta los espacios del cuerpo", () => {
    expect(advertiserPayload({ ...emptyAdvertiserForm(), name: "  Sur ", industry: " super " })).toMatchObject({ name: "Sur", industry: "super", notes: "" });
  });
});

describe("reportRange", () => {
  // Martes 2026-10-06, 12:00 en Buenos Aires (UTC-3).
  const NOW = new Date("2026-10-06T15:00:00Z");

  it("7 y 30 días incluyen hoy y empiezan a las 00:00 locales", () => {
    expect(reportRange("7d", NOW, TZ).from.toISOString()).toBe("2026-09-30T03:00:00.000Z");
    expect(reportRange("30d", NOW, TZ).from.toISOString()).toBe("2026-09-07T03:00:00.000Z");
    expect(reportRange("7d", NOW, TZ).to).toBeUndefined();
  });

  it("este mes va del día 1 hasta ahora", () => {
    const range = reportRange("month", NOW, TZ);
    expect(range.from.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(range.to).toBeUndefined();
  });

  it("el mes anterior es el mes completo, con fin exclusivo", () => {
    const range = reportRange("last-month", NOW, TZ);
    expect(range.from.toISOString()).toBe("2026-09-01T03:00:00.000Z");
    expect(range.to?.toISOString()).toBe("2026-10-01T03:00:00.000Z");
  });

  it("cruza el año al pedir el mes anterior de enero", () => {
    const range = reportRange("last-month", new Date("2027-01-15T15:00:00Z"), TZ);
    expect(range.from.toISOString()).toBe("2026-12-01T03:00:00.000Z");
    expect(range.to?.toISOString()).toBe("2027-01-01T03:00:00.000Z");
  });

  it("cuenta los días en la zona de la emisora, no en UTC", () => {
    // 01:00Z del martes es todavía lunes 22:00 en Buenos Aires: "este mes" y "hoy" siguen en el lunes.
    const lateMonday = new Date("2026-11-01T01:00:00Z");
    expect(reportRange("month", lateMonday, TZ).from.toISOString()).toBe("2026-10-01T03:00:00.000Z");
  });

  it("funciona en una zona con otro desfase", () => {
    expect(reportRange("month", new Date("2026-10-06T15:00:00Z"), "America/Mexico_City").from.toISOString()).toBe("2026-10-01T06:00:00.000Z");
  });
});

describe("fillDays", () => {
  it("completa con ceros los días sin emisiones", () => {
    const filled = fillDays(
      [
        { date: "2026-10-02", count: 4 },
        { date: "2026-10-04", count: 1 },
      ],
      "2026-10-01",
      "2026-10-05",
    );
    expect(filled).toEqual([
      { date: "2026-10-01", count: 0 },
      { date: "2026-10-02", count: 4 },
      { date: "2026-10-03", count: 0 },
      { date: "2026-10-04", count: 1 },
      { date: "2026-10-05", count: 0 },
    ]);
  });

  it("un solo día y rangos invertidos no rompen", () => {
    expect(fillDays([], "2026-10-01", "2026-10-01")).toEqual([{ date: "2026-10-01", count: 0 }]);
    expect(fillDays([], "2026-10-05", "2026-10-01")).toHaveLength(1);
  });
});
