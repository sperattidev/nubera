import type { TextProvider, TextRequest } from "../types.js";

export type TemplateCatalog = Record<string, readonly string[]>;

/**
 * Proveedor de texto sin modelo de lenguaje: elige una variante de plantilla
 * y reemplaza las variables `{nombre}`. Siempre disponible y sin costo.
 */
export class TemplateTextProvider implements TextProvider {
  readonly name = "templates";

  constructor(
    private readonly catalog: TemplateCatalog,
    private readonly random: () => number = Math.random,
  ) {}

  async generate({ task, variables }: TextRequest): Promise<string> {
    const variants = this.catalog[task];
    if (!variants || variants.length === 0) {
      throw new Error(`No hay plantillas para la tarea "${task}"`);
    }
    const index = Math.min(Math.floor(this.random() * variants.length), variants.length - 1);
    const template = variants[index] as string;
    return template.replace(/\{(\w+)\}/g, (_, key: string) => {
      const value = variables[key];
      if (value === undefined) {
        throw new Error(`Falta la variable "${key}" para la tarea "${task}"`);
      }
      return String(value);
    });
  }
}
