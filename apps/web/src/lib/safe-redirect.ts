/**
 * Destino válido tras iniciar sesión. Solo se aceptan rutas internas del panel:
 * un valor como "//sitio-externo.com" o "https://..." se descarta (redirección abierta).
 */
export function safeRedirect(next: string | null | undefined, fallback = "/aire"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return fallback;
  }
  return next;
}
