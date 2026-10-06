import { describe, expect, it } from "vitest";
import { safeRedirect } from "./safe-redirect";

describe("safeRedirect", () => {
  it("acepta rutas internas", () => {
    expect(safeRedirect("/biblioteca")).toBe("/biblioteca");
    expect(safeRedirect("/biblioteca?q=rock&page=2")).toBe("/biblioteca?q=rock&page=2");
  });

  it("usa el destino por defecto si falta o es inválido", () => {
    expect(safeRedirect(null)).toBe("/aire");
    expect(safeRedirect(undefined)).toBe("/aire");
    expect(safeRedirect("")).toBe("/aire");
    expect(safeRedirect("biblioteca")).toBe("/aire");
  });

  it("descarta destinos externos", () => {
    expect(safeRedirect("//sitio-malo.com")).toBe("/aire");
    expect(safeRedirect("https://sitio-malo.com")).toBe("/aire");
    expect(safeRedirect("/\\sitio-malo.com")).toBe("/aire");
    expect(safeRedirect("javascript:alert(1)")).toBe("/aire");
  });

  it("permite elegir otro destino por defecto", () => {
    expect(safeRedirect("//x.com", "/")).toBe("/");
  });
});
