import { describe, expect, it } from "vitest";
import { can, PERMISSIONS, USER_ROLES } from "./permissions.ts";

describe("permisos por rol", () => {
  it("el dueño puede todo", () => {
    for (const permission of PERMISSIONS) {
      expect(can("owner", permission)).toBe(true);
    }
  });

  it("solo el dueño administra usuarios, motores de audio y datos de la emisora", () => {
    for (const role of USER_ROLES.filter((role) => role !== "owner")) {
      expect(can(role, "users:manage")).toBe(false);
      expect(can(role, "agents:manage")).toBe(false);
      expect(can(role, "stations:manage")).toBe(false);
    }
  });

  it("el programador edita biblioteca y grilla pero no la publicidad", () => {
    expect(can("programmer", "assets:write")).toBe(true);
    expect(can("programmer", "schedule:write")).toBe(true);
    expect(can("programmer", "ads:read")).toBe(true);
    expect(can("programmer", "ads:write")).toBe(false);
  });

  it("ventas gestiona la publicidad pero no toca la programación", () => {
    expect(can("sales", "ads:write")).toBe(true);
    expect(can("sales", "plays:read")).toBe(true);
    expect(can("sales", "schedule:read")).toBe(false);
    expect(can("sales", "assets:read")).toBe(false);
  });

  it("el locutor solo lee: biblioteca, grilla e historial", () => {
    expect(can("announcer", "assets:read")).toBe(true);
    expect(can("announcer", "schedule:read")).toBe(true);
    expect(can("announcer", "plays:read")).toBe(true);
    expect(can("announcer", "assets:write")).toBe(false);
    expect(can("announcer", "schedule:write")).toBe(false);
    expect(can("announcer", "ads:read")).toBe(false);
  });
});
