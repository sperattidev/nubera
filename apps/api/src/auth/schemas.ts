import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** Largo mínimo de 12 y máximo de 128 (evita abusar del costo del hash). */
export const newPasswordSchema = z.string().min(12, "Mínimo 12 caracteres").max(128);
