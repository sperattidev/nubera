import { describe, expect, it } from "vitest";
import {
  changePasswordProblems,
  emptyUserForm,
  engineStatus,
  generatePassword,
  newUserPayload,
  newUserProblems,
  passwordProblems,
  passwordStrength,
  secureRandomInt,
  timeZoneOptions,
  tokenEnvLine,
  tokenProblems,
  TIME_ZONES,
} from "./settings";

/** Generador determinista para los tests (congruencial lineal). */
function seeded(seed: number) {
  let state = seed;
  return (max: number) => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state % max;
  };
}

describe("generatePassword", () => {
  it("tiene el largo pedido y nunca menos del mínimo", () => {
    expect(generatePassword(16, seeded(1))).toHaveLength(16);
    expect(generatePassword(24, seeded(2))).toHaveLength(24);
    expect(generatePassword(4, seeded(3))).toHaveLength(12);
    expect(generatePassword(500, seeded(4))).toHaveLength(128);
  });

  it("siempre incluye minúscula, mayúscula, número y símbolo", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const password = generatePassword(12, seeded(seed));
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/\d/);
      expect(password).toMatch(/[!@#$%&*?\-_]/);
    }
  });

  it("evita los caracteres que se confunden al leerlos", () => {
    for (let seed = 1; seed <= 200; seed++) {
      expect(generatePassword(32, seeded(seed))).not.toMatch(/[0O1lI]/);
    }
  });

  it("no deja las clases de caracteres siempre al principio", () => {
    const firstChars = new Set(Array.from({ length: 100 }, (_, seed) => generatePassword(16, seeded(seed + 1))[0]));
    expect(firstChars.size).toBeGreaterThan(10);
  });

  it("con el generador real da contraseñas distintas y válidas", () => {
    const passwords = Array.from({ length: 20 }, () => generatePassword());
    expect(new Set(passwords).size).toBe(20);
    for (const password of passwords) {
      expect(passwordProblems(password)).toEqual([]);
    }
  });
});

describe("secureRandomInt", () => {
  it("devuelve enteros dentro del rango y cubre todos los valores", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const value = secureRandomInt(6);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(6);
      seen.add(value);
    }
    expect(seen.size).toBe(6);
  });
});

describe("contraseñas", () => {
  it("valida el largo (mismas reglas que la API)", () => {
    expect(passwordProblems("a".repeat(11))).toHaveLength(1);
    expect(passwordProblems("a".repeat(12))).toEqual([]);
    expect(passwordProblems("a".repeat(128))).toEqual([]);
    expect(passwordProblems("a".repeat(129))).toHaveLength(1);
  });

  it("el medidor premia el largo y la variedad", () => {
    expect(passwordStrength("").level).toBe(0);
    expect(passwordStrength("corta")).toEqual({ level: 0, label: "Muy corta" });
    expect(passwordStrength("todaminuscula")).toEqual({ level: 1, label: "Aceptable" });
    expect(passwordStrength("Variada123456").level).toBe(2);
    expect(passwordStrength("una frase bastante larga")).toEqual({ level: 3, label: "Fuerte" });
    expect(passwordStrength("Abcdefgh12345678!")).toEqual({ level: 3, label: "Fuerte" });
  });

  it("cambio de contraseña: exige la actual, la confirmación y que sea distinta", () => {
    const ok = { current: "contraseña-actual-1", next: "contraseña-nueva-123", confirm: "contraseña-nueva-123" };
    expect(changePasswordProblems(ok)).toEqual([]);
    expect(changePasswordProblems({ ...ok, current: "" })).toContain("Escribí tu contraseña actual.");
    expect(changePasswordProblems({ ...ok, confirm: "otra" })).toContain("Las contraseñas nuevas no coinciden.");
    expect(changePasswordProblems({ ...ok, next: "corta", confirm: "corta" }).join(" ")).toMatch(/al menos 12/);
    expect(changePasswordProblems({ ...ok, next: ok.current, confirm: ok.current })).toContain("La contraseña nueva tiene que ser distinta de la actual.");
  });
});

describe("usuarios nuevos", () => {
  const valid = { ...emptyUserForm(), name: "Ana Pérez", email: "Ana@Radio.test", password: "contraseña-segura-1" };

  it("un usuario completo no tiene problemas", () => {
    expect(newUserProblems(valid)).toEqual([]);
  });

  it("exige nombre, un email válido y contraseña", () => {
    expect(newUserProblems({ ...valid, name: " " })).toContain("Poné el nombre de la persona.");
    expect(newUserProblems({ ...valid, email: "no-es-email" })).toContain("El email no es válido.");
    expect(newUserProblems({ ...valid, password: "corta" }).join(" ")).toMatch(/al menos 12/);
  });

  it("arma el cuerpo con el email en minúsculas y sin espacios", () => {
    expect(newUserPayload({ ...valid, name: "  Ana Pérez ", email: " Ana@Radio.test " })).toEqual({
      name: "Ana Pérez",
      email: "ana@radio.test",
      role: "programmer",
      password: "contraseña-segura-1",
    });
  });
});

describe("motor de audio", () => {
  const now = Date.parse("2026-10-06T15:00:00Z");

  it("conectado si consultó hace menos de 90 segundos", () => {
    expect(engineStatus("2026-10-06T14:59:30Z", now)).toBe("online");
    expect(engineStatus("2026-10-06T14:58:30Z", now)).toBe("online");
    expect(engineStatus("2026-10-06T14:58:29Z", now)).toBe("offline");
    expect(engineStatus("2026-10-05T10:00:00Z", now)).toBe("offline");
  });

  it("nunca conectado si el token no se usó", () => {
    expect(engineStatus(null, now)).toBe("never");
  });

  it("arma la línea del .env y valida el nombre del token", () => {
    expect(tokenEnvLine("nbr_abc")).toBe("NUBERA_AGENT_TOKEN=nbr_abc");
    expect(tokenProblems("  ")).toHaveLength(1);
    expect(tokenProblems("Estudio principal")).toEqual([]);
  });
});

describe("zonas horarias", () => {
  it("la lista incluye Buenos Aires y UTC", () => {
    expect(TIME_ZONES.map((zone) => zone.id)).toContain("America/Argentina/Buenos_Aires");
    expect(TIME_ZONES.map((zone) => zone.id)).toContain("UTC");
  });

  it("todas las zonas de la lista son válidas para el sistema", () => {
    for (const zone of TIME_ZONES) {
      expect(() => new Intl.DateTimeFormat("en", { timeZone: zone.id })).not.toThrow();
    }
  });

  it("si la zona de la emisora no figura, se agrega al principio", () => {
    expect(timeZoneOptions("America/Argentina/Cordoba")).toBe(TIME_ZONES);
    const extended = timeZoneOptions("Pacific/Auckland");
    expect(extended[0]).toEqual({ id: "Pacific/Auckland", label: "Pacific/Auckland" });
    expect(extended).toHaveLength(TIME_ZONES.length + 1);
  });
});
