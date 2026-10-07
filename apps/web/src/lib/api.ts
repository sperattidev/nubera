/**
 * Cliente de la API para el navegador. Todas las llamadas van a `/api/*` del
 * propio panel (que las reenvía a la API), así la cookie de sesión es de mismo origen.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function goToLogin() {
  const next = window.location.pathname + window.location.search;
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}

export async function readError(response: Response): Promise<ApiError> {
  let message = response.statusText || "Error inesperado";
  try {
    const data = (await response.json()) as { error?: string; issues?: { path?: (string | number)[]; message?: string }[] };
    if (data.issues?.length) {
      message = data.issues.map((issue) => [issue.path?.join("."), issue.message].filter(Boolean).join(": ")).join(" · ");
    } else if (data.error) {
      message = data.error;
    }
  } catch {
    // La respuesta no era JSON; se deja el texto de estado.
  }
  return new ApiError(response.status, message);
}

interface Options {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  /** En el login un 401 es una respuesta esperada, no una sesión vencida. */
  allowUnauthorized?: boolean;
}

export async function api<T>(path: string, { method = "GET", body, signal, allowUnauthorized }: Options = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
    signal,
  });

  if (response.status === 401 && !allowUnauthorized) {
    goToLogin();
    throw new ApiError(401, "La sesión venció");
  }
  if (!response.ok) {
    throw await readError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

/** Mensaje legible para mostrar en un aviso. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Ocurrió un error inesperado";
}
