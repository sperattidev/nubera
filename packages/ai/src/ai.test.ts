import { describe, expect, it, vi } from "vitest";
import { FallbackTextProvider, TemplateTextProvider, type TextProvider } from "./index.js";

const catalog = {
  "hora-clima": ["Son las {hora}, {temp} grados en {ciudad}.", "{ciudad}: {temp} grados, las {hora}."],
};

describe("TemplateTextProvider", () => {
  it("completa las variables de la plantilla elegida", async () => {
    const provider = new TemplateTextProvider(catalog, () => 0);
    const text = await provider.generate({
      task: "hora-clima",
      variables: { hora: "03:05", temp: 14, ciudad: "Firmat" },
    });
    expect(text).toBe("Son las 03:05, 14 grados en Firmat.");
  });

  it("falla si falta una variable", async () => {
    const provider = new TemplateTextProvider(catalog, () => 0);
    await expect(
      provider.generate({ task: "hora-clima", variables: { hora: "03:05" } }),
    ).rejects.toThrow('Falta la variable "temp"');
  });

  it("falla si la tarea no existe", async () => {
    const provider = new TemplateTextProvider(catalog);
    await expect(provider.generate({ task: "otra", variables: {} })).rejects.toThrow("otra");
  });
});

describe("FallbackTextProvider", () => {
  const failing: TextProvider = {
    name: "modelo",
    generate: () => Promise.reject(new Error("modelo caído")),
  };
  const templates = new TemplateTextProvider({ saludo: ["Hola {nombre}"] }, () => 0);

  it("usa el siguiente proveedor cuando el primero falla", async () => {
    const onError = vi.fn();
    const provider = new FallbackTextProvider([failing, templates], onError);
    await expect(
      provider.generate({ task: "saludo", variables: { nombre: "Firmat" } }),
    ).resolves.toBe("Hola Firmat");
    expect(onError).toHaveBeenCalledOnce();
  });

  it("propaga el último error si todos fallan", async () => {
    const provider = new FallbackTextProvider([failing]);
    await expect(provider.generate({ task: "x", variables: {} })).rejects.toThrow("modelo caído");
  });
});
