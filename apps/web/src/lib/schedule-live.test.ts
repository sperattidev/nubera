import { describe, expect, it } from "vitest";
import { blockToForm, formProblems, formToPayload, formToRotation, isLive, newForm, type BlockForm, type ScheduleBlock } from "./schedule";

const rotation = { pool: [{ category: "music" as const, weight: 3 }], insertions: [], artistSeparation: 3, trackSeparationMinutes: 120 };

const autoBlock: ScheduleBlock = { id: "b1", name: "Tarde", days: [1, 2, 3], start: "14:00", end: "18:00", rotation };
const liveBlock: ScheduleBlock = { id: "b2", name: "Mañanas con Juan", mode: "live", days: [1, 2, 3, 4, 5], start: "08:00", end: "12:00", rotation };

describe("programas en vivo en la grilla", () => {
  it("un bloque sin modo es automático", () => {
    expect(isLive(autoBlock)).toBe(false);
    expect(isLive({ mode: "auto" })).toBe(false);
    expect(isLive(liveBlock)).toBe(true);
  });

  it("el formulario nuevo es automático y el de un programa en vivo conserva su tipo", () => {
    expect(newForm(1, 480).mode).toBe("auto");
    expect(blockToForm(autoBlock).mode).toBe("auto");
    expect(blockToForm(liveBlock).mode).toBe("live");
  });

  it("un programa en vivo se manda sin rotación", () => {
    const payload = formToPayload(blockToForm(liveBlock));
    expect(payload).toMatchObject({ name: "Mañanas con Juan", mode: "live", start: "08:00", end: "12:00" });
    expect(payload).not.toHaveProperty("rotation");
  });

  it("un bloque automático se manda con su rotación", () => {
    const payload = formToPayload(blockToForm(autoBlock));
    expect(payload.mode).toBe("auto");
    expect(payload).toHaveProperty("rotation");
    expect((payload as { rotation: unknown }).rotation).toEqual(formToRotation(blockToForm(autoBlock)));
  });

  it("de un programa en vivo solo se validan el nombre, los días y el horario", () => {
    const broken: BlockForm = { ...blockToForm(liveBlock), pool: [], insertions: [{ category: "jingle", everyTracks: 0 }], artistSeparation: 999 };
    expect(formProblems(broken)).toEqual([]);

    expect(formProblems({ ...broken, name: " " })).toEqual(["Poné un nombre al bloque."]);
    expect(formProblems({ ...broken, days: [] })).toEqual(["Elegí al menos un día."]);
    expect(formProblems({ ...broken, start: "12:00", end: "08:00" })).toHaveLength(1);
  });

  it("el mismo error en un bloque automático sí se reporta", () => {
    const broken: BlockForm = { ...blockToForm(autoBlock), mode: "auto", pool: [] };
    expect(formProblems(broken)).toContain("Agregá al menos una categoría a la mezcla.");
  });
});
