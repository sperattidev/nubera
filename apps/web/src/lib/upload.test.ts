import { describe, expect, it } from "vitest";
import { fileProblem, MAX_UPLOAD_BYTES } from "./upload";

describe("fileProblem", () => {
  it("acepta los formatos de audio soportados, sin importar mayúsculas", () => {
    for (const name of ["tema.mp3", "TEMA.MP3", "a.wav", "a.flac", "a.ogg", "a.m4a", "a.aac", "mi.tema.final.mp3"]) {
      expect(fileProblem({ name, size: 1000 })).toBeNull();
    }
  });

  it("rechaza otros formatos y nombres sin extensión", () => {
    expect(fileProblem({ name: "virus.exe", size: 1000 })).toMatch(/Formato no soportado/);
    expect(fileProblem({ name: "documento.pdf", size: 1000 })).toMatch(/Formato no soportado/);
    expect(fileProblem({ name: "sinextension", size: 1000 })).toMatch(/Formato no soportado/);
    expect(fileProblem({ name: "mp3", size: 1000 })).toMatch(/Formato no soportado/);
  });

  it("rechaza archivos vacíos o demasiado grandes", () => {
    expect(fileProblem({ name: "a.mp3", size: 0 })).toBe("El archivo está vacío");
    expect(fileProblem({ name: "a.mp3", size: MAX_UPLOAD_BYTES })).toBeNull();
    expect(fileProblem({ name: "a.mp3", size: MAX_UPLOAD_BYTES + 1 })).toMatch(/200 MB/);
  });
});
