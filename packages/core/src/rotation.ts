import { z } from "zod";
import { ASSET_CATEGORIES } from "./categories.ts";

const category = z.enum(ASSET_CATEGORIES);

/**
 * Reglas de rotación de un bloque horario:
 * - `pool`: categorías de las que se elige (ponderadas por `weight`).
 * - `insertions`: cada N temas se intercala una categoría (p. ej. un jingle).
 * - `artistSeparation`: cantidad de emisiones previas en las que no se repite el artista.
 * - `trackSeparationMinutes`: tiempo mínimo antes de repetir el mismo audio.
 */
export const rotationSchema = z.object({
  pool: z
    .array(z.object({ category, weight: z.number().int().min(1).max(100) }))
    .min(1)
    .max(ASSET_CATEGORIES.length)
    .refine((pool) => new Set(pool.map((p) => p.category)).size === pool.length, {
      message: "No se puede repetir una categoría en el pool",
    }),
  insertions: z
    .array(z.object({ category, everyTracks: z.number().int().min(1).max(50) }))
    .max(ASSET_CATEGORIES.length)
    .default([]),
  artistSeparation: z.number().int().min(0).max(50).default(3),
  trackSeparationMinutes: z.number().int().min(0).max(1440).default(120),
  /**
   * Tandas publicitarias: cada `everyTracks` emisiones se emiten hasta
   * `spotsPerBreak` avisos de las campañas vigentes. Sin esta clave, el bloque
   * no emite publicidad. La categoría "ad" no debe incluirse en el pool.
   */
  ads: z
    .object({
      everyTracks: z.number().int().min(1).max(50),
      spotsPerBreak: z.number().int().min(1).max(6),
    })
    .optional(),
});

export type Rotation = z.infer<typeof rotationSchema>;
