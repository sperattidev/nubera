import { describe, expect, it } from "vitest";
import {
  applyDrag,
  blockToForm,
  coverage,
  describeDays,
  dominantCategory,
  formProblems,
  formToPayload,
  formToRotation,
  layoutDay,
  newForm,
  nudge,
  overlapsOf,
  payloadWithTimes,
  TIME_OPTIONS,
  type BlockForm,
  type ScheduleBlock,
} from "./schedule";

const block = (overrides: Partial<ScheduleBlock> = {}): ScheduleBlock => ({
  id: "b1",
  name: "Mañana",
  days: [1, 2, 3, 4, 5],
  start: "06:00",
  end: "12:00",
  rotation: {
    pool: [{ category: "music", weight: 1 }],
    insertions: [],
    artistSeparation: 3,
    trackSeparationMinutes: 120,
  },
  ...overrides,
});

describe("TIME_OPTIONS", () => {
  it("va de 00:00 a 24:00 cada 30 minutos", () => {
    expect(TIME_OPTIONS).toHaveLength(49);
    expect(TIME_OPTIONS[0]).toBe("00:00");
    expect(TIME_OPTIONS[13]).toBe("06:30");
    expect(TIME_OPTIONS.at(-1)).toBe("24:00");
  });
});

describe("layoutDay", () => {
  it("solo incluye los bloques de ese día", () => {
    const placed = layoutDay([block({ days: [1] }), block({ id: "b2", days: [2] })], 1);
    expect(placed.map((p) => p.block.id)).toEqual(["b1"]);
  });

  const depths = (blocks: ScheduleBlock[]) => layoutDay(blocks, 1).map((p) => [p.block.id, p.depth]);

  it("los bloques consecutivos no se apilan", () => {
    expect(
      depths([block({ id: "a", start: "06:00", end: "12:00" }), block({ id: "b", start: "12:00", end: "18:00" })]),
    ).toEqual([
      ["a", 0],
      ["b", 0],
    ]);
  });

  it("el que empieza más tarde va encima del que se superpone", () => {
    expect(
      depths([block({ id: "a", start: "06:00", end: "12:00" }), block({ id: "b", start: "10:00", end: "14:00" })]),
    ).toEqual([
      ["a", 0],
      ["b", 1],
    ]);
  });

  it("un bloque general de todo el día queda debajo de los específicos", () => {
    expect(
      depths([
        block({ id: "general", start: "00:00", end: "24:00" }),
        block({ id: "tarde", start: "12:00", end: "20:00" }),
        block({ id: "noticiero", start: "12:30", end: "13:30" }),
      ]),
    ).toEqual([
      ["general", 0],
      ["tarde", 1],
      ["noticiero", 2],
    ]);
  });

  it("solo cuentan los bloques que siguen activos cuando empieza el nuevo", () => {
    expect(
      depths([
        block({ id: "a", start: "06:00", end: "12:00" }),
        block({ id: "b", start: "08:00", end: "09:00" }),
        block({ id: "c", start: "10:00", end: "11:00" }),
      ]),
    ).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 1],
    ]);
  });

  it("un grupo separado vuelve a empezar en cero", () => {
    expect(
      depths([
        block({ id: "a", start: "06:00", end: "10:00" }),
        block({ id: "b", start: "08:00", end: "12:00" }),
        block({ id: "c", start: "15:00", end: "16:00" }),
      ]).at(-1),
    ).toEqual(["c", 0]);
  });

  it("si empiezan a la vez, queda encima el más corto, que es el que gana en el motor", () => {
    const placed = layoutDay(
      [block({ id: "a", start: "12:00", end: "13:30" }), block({ id: "b", start: "12:00", end: "20:00" })],
      1,
    );
    // Se dibujan en orden: el último queda arriba.
    expect(placed.map((p) => p.block.id)).toEqual(["b", "a"]);
    expect(placed.at(-1)?.depth).toBe(1);
  });

  it("ante un empate total queda encima el de menor id", () => {
    const placed = layoutDay(
      [block({ id: "b", start: "10:00", end: "12:00" }), block({ id: "a", start: "10:00", end: "12:00" })],
      1,
    );
    expect(placed.map((p) => p.block.id)).toEqual(["b", "a"]);
  });
});

describe("layoutDay: bloques tapados", () => {
  const covered = (blocks: ScheduleBlock[]) => Object.fromEntries(layoutDay(blocks, 1).map((p) => [p.block.id, p.coveredTop]));

  it("el que empieza a la vez que otro más corto queda tapado donde va su título", () => {
    expect(
      covered([
        block({ id: "tarde", start: "12:00", end: "20:00" }),
        block({ id: "noticiero", start: "12:00", end: "13:30" }),
      ]),
    ).toEqual({ tarde: true, noticiero: false });
  });

  it("también si el otro empieza un poco después, dentro de la zona del título", () => {
    expect(
      covered([block({ id: "a", start: "10:00", end: "14:00" }), block({ id: "b", start: "10:30", end: "11:00" })]),
    ).toEqual({ a: true, b: false });
  });

  it("no cuenta si el de arriba empieza mucho después", () => {
    expect(
      covered([
        block({ id: "general", start: "00:00", end: "24:00" }),
        block({ id: "mañana", start: "06:00", end: "12:00" }),
      ]),
    ).toEqual({ general: false, mañana: false });
  });

  it("los bloques que no se superponen no están tapados", () => {
    expect(
      covered([block({ id: "a", start: "06:00", end: "10:00" }), block({ id: "b", start: "10:00", end: "12:00" })]),
    ).toEqual({ a: false, b: false });
  });
});

describe("applyDrag", () => {
  const origin = { start: 6 * 60, end: 10 * 60 };

  it("mover conserva la duración y redondea a 15 minutos", () => {
    expect(applyDrag("move", origin, 60)).toEqual({ start: 420, end: 660 });
    expect(applyDrag("move", origin, 22)).toEqual({ start: 375, end: 615 });
    expect(applyDrag("move", origin, -67)).toEqual({ start: 300, end: 540 });
    expect(applyDrag("move", origin, 0)).toEqual(origin);
  });

  it("mover no saca el bloque del día", () => {
    expect(applyDrag("move", origin, -1000)).toEqual({ start: 0, end: 240 });
    expect(applyDrag("move", origin, 5000)).toEqual({ start: 1200, end: 1440 });
  });

  it("redimensionar el final cambia solo el final, con un mínimo de 30 minutos", () => {
    expect(applyDrag("resize-end", origin, 120)).toEqual({ start: 360, end: 720 });
    expect(applyDrag("resize-end", origin, -1000)).toEqual({ start: 360, end: 390 });
    expect(applyDrag("resize-end", origin, 5000)).toEqual({ start: 360, end: 1440 });
  });

  it("redimensionar el inicio cambia solo el inicio, con un mínimo de 30 minutos", () => {
    expect(applyDrag("resize-start", origin, -60)).toEqual({ start: 300, end: 600 });
    expect(applyDrag("resize-start", origin, 5000)).toEqual({ start: 570, end: 600 });
    expect(applyDrag("resize-start", origin, -5000)).toEqual({ start: 0, end: 600 });
  });
});

describe("nudge (teclado)", () => {
  const origin = { start: 6 * 60, end: 10 * 60 };

  it("mueve de a 15 minutos, o cambia solo el final", () => {
    expect(nudge(origin, "down", false)).toEqual({ start: 375, end: 615 });
    expect(nudge(origin, "up", false)).toEqual({ start: 345, end: 585 });
    expect(nudge(origin, "down", true)).toEqual({ start: 360, end: 615 });
    expect(nudge(origin, "up", true)).toEqual({ start: 360, end: 585 });
  });

  it("respeta los límites del día y la duración mínima", () => {
    expect(nudge({ start: 0, end: 120 }, "up", false)).toEqual({ start: 0, end: 120 });
    expect(nudge({ start: 1320, end: 1440 }, "down", false)).toEqual({ start: 1320, end: 1440 });
    expect(nudge({ start: 600, end: 630 }, "up", true)).toEqual({ start: 600, end: 630 });
  });
});

describe("payloadWithTimes", () => {
  it("cambia solo el horario y conserva el resto del bloque", () => {
    const original = block({
      rotation: {
        pool: [{ category: "music", weight: 3 }],
        insertions: [{ category: "jingle", everyTracks: 4 }],
        artistSeparation: 2,
        trackSeparationMinutes: 60,
        ads: { everyTracks: 5, spotsPerBreak: 2 },
      },
    });
    const payload = payloadWithTimes(original, 7 * 60 + 15, 11 * 60);
    expect(payload).toMatchObject({ name: "Mañana", days: [1, 2, 3, 4, 5], start: "07:15", end: "11:00" });
    expect(payload.rotation).toEqual(original.rotation);
  });
});

describe("coverage", () => {
  it("sin bloques no hay cobertura y toda la semana es un hueco", () => {
    const { percent, gaps } = coverage([]);
    expect(percent).toBe(0);
    expect(gaps).toHaveLength(7);
    expect(gaps[0]).toEqual({ day: 1, start: 0, end: 1440 });
  });

  it("un bloque de todo el día y todos los días cubre el 100 %", () => {
    const all = block({ days: [1, 2, 3, 4, 5, 6, 7], start: "00:00", end: "24:00" });
    expect(coverage([all])).toEqual({ percent: 100, gaps: [] });
  });

  it("detecta los huecos entre bloques y al principio y al final del día", () => {
    const { gaps } = coverage([block({ days: [1], start: "06:00", end: "10:00" }), block({ id: "b2", days: [1], start: "12:00", end: "20:00" })]);
    const monday = gaps.filter((gap) => gap.day === 1);
    expect(monday).toEqual([
      { day: 1, start: 0, end: 360 },
      { day: 1, start: 600, end: 720 },
      { day: 1, start: 1200, end: 1440 },
    ]);
  });

  it("no cuenta dos veces lo que se superpone", () => {
    const { percent } = coverage([
      block({ days: [1, 2, 3, 4, 5, 6, 7], start: "00:00", end: "12:00" }),
      block({ id: "b2", days: [1, 2, 3, 4, 5, 6, 7], start: "06:00", end: "18:00" }),
    ]);
    expect(percent).toBe(75);
  });
});

describe("dominantCategory", () => {
  it("elige la categoría con más peso", () => {
    const rotation = {
      ...block().rotation,
      pool: [
        { category: "music" as const, weight: 3 },
        { category: "institutional" as const, weight: 7 },
      ],
    };
    expect(dominantCategory(rotation)).toBe("institutional");
  });

  it("ante un empate gana la primera", () => {
    const rotation = {
      ...block().rotation,
      pool: [
        { category: "jingle" as const, weight: 2 },
        { category: "music" as const, weight: 2 },
      ],
    };
    expect(dominantCategory(rotation)).toBe("jingle");
  });
});

describe("overlapsOf", () => {
  const morning = block({ id: "m", days: [1, 2], start: "06:00", end: "12:00" });

  it("encuentra bloques que comparten día y horario", () => {
    const other = block({ id: "o", days: [2, 3], start: "11:00", end: "13:00" });
    expect(overlapsOf(morning, [morning, other]).map((b) => b.id)).toEqual(["o"]);
  });

  it("no cuenta el que solo termina cuando el otro empieza, ni otros días", () => {
    const touching = block({ id: "t", days: [1], start: "12:00", end: "14:00" });
    const otherDay = block({ id: "d", days: [5], start: "06:00", end: "12:00" });
    expect(overlapsOf(morning, [morning, touching, otherDay])).toEqual([]);
  });
});

describe("describeDays", () => {
  it("resume los días", () => {
    expect(describeDays([1, 2, 3, 4, 5, 6, 7])).toBe("Todos los días");
    expect(describeDays([1, 2, 3, 4, 5])).toBe("Lun a Vie");
    expect(describeDays([1, 3, 5])).toBe("Lun, Mié y Vie");
    expect(describeDays([6, 7])).toBe("Sáb y Dom");
    expect(describeDays([4])).toBe("Jue");
  });
});

describe("formulario", () => {
  it("un bloque nuevo dura dos horas y no se pasa de la medianoche", () => {
    expect(newForm(3, 8 * 60)).toMatchObject({ days: [3], start: "08:00", end: "10:00" });
    expect(newForm(3, 23 * 60)).toMatchObject({ start: "23:00", end: "24:00" });
    expect(newForm(3, 24 * 60)).toMatchObject({ start: "23:30", end: "24:00" });
  });

  it("ida y vuelta entre bloque, formulario y cuerpo de la API", () => {
    const original = block({
      rotation: {
        pool: [
          { category: "music", weight: 4 },
          { category: "institutional", weight: 1 },
        ],
        insertions: [{ category: "jingle", everyTracks: 4 }],
        artistSeparation: 2,
        trackSeparationMinutes: 90,
        ads: { everyTracks: 5, spotsPerBreak: 2 },
      },
    });
    const payload = formToPayload(blockToForm(original));
    expect(payload).toEqual({
      name: "Mañana",
      mode: "auto",
      days: [1, 2, 3, 4, 5],
      start: "06:00",
      end: "12:00",
      rotation: original.rotation,
    });
  });

  it("sin tandas, la rotación no lleva la clave ads", () => {
    expect("ads" in formToRotation(newForm(1, 0))).toBe(false);
  });

  it("ordena los días y recorta el nombre", () => {
    const form: BlockForm = { ...newForm(1, 0), name: "  Noche ", days: [5, 1, 3] };
    expect(formToPayload(form)).toMatchObject({ name: "Noche", days: [1, 3, 5] });
  });

  describe("formProblems", () => {
    const valid = (): BlockForm => ({ ...newForm(1, 360), name: "Mañana" });

    it("un formulario correcto no tiene problemas", () => {
      expect(formProblems(valid())).toEqual([]);
    });

    it("exige nombre, días y un horario coherente", () => {
      expect(formProblems({ ...valid(), name: " " })).toContain("Poné un nombre al bloque.");
      expect(formProblems({ ...valid(), days: [] })).toContain("Elegí al menos un día.");
      expect(formProblems({ ...valid(), start: "10:00", end: "10:00" }).join(" ")).toMatch(/posterior al inicio/);
      expect(formProblems({ ...valid(), start: "20:00", end: "06:00" }).join(" ")).toMatch(/dos bloques/);
    });

    it("valida la mezcla de categorías", () => {
      expect(formProblems({ ...valid(), pool: [] }).join(" ")).toMatch(/al menos una categoría/);
      expect(
        formProblems({
          ...valid(),
          pool: [
            { category: "music", weight: 1 },
            { category: "music", weight: 2 },
          ],
        }).join(" "),
      ).toMatch(/no puede repetirse/);
      expect(formProblems({ ...valid(), pool: [{ category: "music", weight: 0 }] }).join(" ")).toMatch(/1 a 100/);
      expect(formProblems({ ...valid(), pool: [{ category: "ad", weight: 1 }] }).join(" ")).toMatch(/tandas/);
    });

    it("valida intercalados, tandas y separaciones", () => {
      expect(formProblems({ ...valid(), insertions: [{ category: "jingle", everyTracks: 0 }] }).join(" ")).toMatch(/1 a 50/);
      expect(
        formProblems({
          ...valid(),
          insertions: [
            { category: "jingle", everyTracks: 2 },
            { category: "jingle", everyTracks: 3 },
          ],
        }).join(" "),
      ).toMatch(/dos veces/);
      expect(formProblems({ ...valid(), adsEnabled: true, adsSpotsPerBreak: 7 }).join(" ")).toMatch(/1 a 6 avisos/);
      expect(formProblems({ ...valid(), adsEnabled: false, adsSpotsPerBreak: 7 })).toEqual([]);
      expect(formProblems({ ...valid(), artistSeparation: 51 }).join(" ")).toMatch(/0 a 50/);
      expect(formProblems({ ...valid(), trackSeparationMinutes: 1441 }).join(" ")).toMatch(/1440/);
      expect(formProblems({ ...valid(), artistSeparation: 1.5 }).length).toBeGreaterThan(0);
    });
  });
});
