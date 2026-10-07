import { isIP } from "node:net";

/**
 * IP del visitante, según lo que agrega el proxy propio (solo se usa si se confía en él).
 * Cloudflare reescribe `CF-Connecting-IP` en cada pedido, así que el visitante no puede falsearlo.
 * `X-Forwarded-For` sí admite valores puestos por el visitante: el proxy agrega el suyo al
 * final, por eso se toma el último y nunca el primero.
 */
export function clientIp(headers: { get(name: string): string | null }): string | null {
  const direct = headers.get("cf-connecting-ip")?.trim();
  if (direct && isIP(direct)) {
    return direct;
  }
  const last = headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return last && isIP(last) ? last : null;
}
