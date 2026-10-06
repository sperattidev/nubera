import type { TextProvider, TextRequest } from "./types.js";

/**
 * Prueba los proveedores en orden y devuelve el primer resultado exitoso.
 * Garantiza degradación elegante: si el modelo falla, se usan plantillas.
 */
export class FallbackTextProvider implements TextProvider {
  readonly name: string;

  constructor(
    private readonly providers: readonly TextProvider[],
    private readonly onError?: (provider: TextProvider, error: unknown) => void,
  ) {
    if (providers.length === 0) {
      throw new Error("Se requiere al menos un proveedor");
    }
    this.name = `fallback(${providers.map((p) => p.name).join(" > ")})`;
  }

  async generate(request: TextRequest): Promise<string> {
    let lastError: unknown;
    for (const provider of this.providers) {
      try {
        return await provider.generate(request);
      } catch (error) {
        lastError = error;
        this.onError?.(provider, error);
      }
    }
    throw lastError;
  }
}
