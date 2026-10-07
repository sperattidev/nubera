import type { NextRequest } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { API_URL } from "@/lib/server";

/**
 * Proxy hacia la API. El navegador solo habla con el panel (mismo origen), por lo que
 * no hace falta CORS y la cookie de sesión nunca sale del dominio del panel.
 * Reenvía cuerpos y respuestas en streaming (subidas de audio grandes, escucha con Range).
 */
export const dynamic = "force-dynamic";

const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "accept-language",
  "content-length",
  "content-type",
  "cookie",
  "if-none-match",
  "range",
  "user-agent",
];
const DROPPED_RESPONSE_HEADERS = new Set(["connection", "content-encoding", "keep-alive", "transfer-encoding", "upgrade"]);

type Context = { params: Promise<{ path: string[] }> };

async function handle(request: NextRequest, { params }: Context): Promise<Response> {
  const { path } = await params;
  if (path.some((segment) => segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\"))) {
    return Response.json({ error: "Ruta inválida" }, { status: 400 });
  }

  const target = `${API_URL}/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  // Solo se confía en la IP del cliente si hay un proxy propio delante del panel.
  if (process.env.NUBERA_TRUST_FORWARDED === "true") {
    const ip = clientIp(request.headers);
    if (ip) {
      headers.set("x-forwarded-for", ip);
    }
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      duplex: "half",
      redirect: "manual",
      cache: "no-store",
      signal: request.signal,
    } as RequestInit & { duplex: "half" });
  } catch {
    return Response.json({ error: "No se pudo comunicar con el servidor" }, { status: 502 });
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, name) => {
    if (name !== "set-cookie" && !DROPPED_RESPONSE_HEADERS.has(name)) {
      responseHeaders.append(name, value);
    }
  });
  for (const cookie of upstream.headers.getSetCookie()) {
    responseHeaders.append("set-cookie", cookie);
  }
  if (upstream.headers.get("content-encoding")) {
    responseHeaders.delete("content-length");
  }
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

export { handle as DELETE, handle as GET, handle as PATCH, handle as POST, handle as PUT };
