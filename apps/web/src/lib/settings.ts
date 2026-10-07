import type { Role } from "@nubera/core";

// ---------------------------------------------------------------------------
// Tipos de la API
// ---------------------------------------------------------------------------

export interface TeamUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

export interface AgentToken {
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt: string | null;
}

/** Respuesta de crear un token: es la única vez que se conoce su valor. */
export interface CreatedAgentToken extends AgentToken {
  token: string;
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export const ROLE_OPTIONS: { id: Role; label: string; description: string }[] = [
  { id: "owner", label: "Dueño", description: "Administra todo: usuarios, motor de audio, emisora, programación y publicidad." },
  { id: "programmer", label: "Programador", description: "Arma la biblioteca y la grilla. Ve la publicidad pero no la modifica." },
  { id: "sales", label: "Ventas", description: "Gestiona anunciantes, campañas y certificados. Ve el historial." },
  { id: "announcer", label: "Locutor", description: "Solo lectura: biblioteca, grilla e historial." },
];

// ---------------------------------------------------------------------------
// Contraseñas
// ---------------------------------------------------------------------------

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

const LOWER = "abcdefghijkmnpqrstuvwxyz"; // sin l ni o
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // sin I ni O
const DIGITS = "23456789"; // sin 0 ni 1
const SYMBOLS = "!@#$%&*?-_";
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

/** Entero aleatorio en [0, max) sin sesgo, con el generador criptográfico del navegador. */
export function secureRandomInt(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0]! >= limit);
  return buffer[0]! % max;
}

/**
 * Contraseña aleatoria legible: sin caracteres que se confunden (0/O, 1/l/I) y con al
 * menos una minúscula, una mayúscula, un número y un símbolo.
 */
export function generatePassword(length = 16, randomInt: (max: number) => number = secureRandomInt): string {
  const size = Math.min(Math.max(length, PASSWORD_MIN), PASSWORD_MAX);
  const pick = (alphabet: string) => alphabet[randomInt(alphabet.length)]!;
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < size) {
    chars.push(pick(ALL));
  }
  // Fisher-Yates: sin esto las cuatro clases quedarían siempre al principio.
  for (let index = chars.length - 1; index > 0; index--) {
    const swap = randomInt(index + 1);
    [chars[index], chars[swap]] = [chars[swap]!, chars[index]!];
  }
  return chars.join("");
}

export function passwordProblems(password: string): string[] {
  if (password.length < PASSWORD_MIN) return [`La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`];
  if (password.length > PASSWORD_MAX) return [`La contraseña no puede superar los ${PASSWORD_MAX} caracteres.`];
  return [];
}

export type Strength = { level: 0 | 1 | 2 | 3; label: string };

/** Medidor orientativo (la regla real es el largo mínimo): premia el largo más que la variedad. */
export function passwordStrength(password: string): Strength {
  if (password.length === 0) return { level: 0, label: "" };
  if (password.length < PASSWORD_MIN) return { level: 0, label: "Muy corta" };
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
  if (password.length >= 20 || (password.length >= 16 && classes >= 3)) return { level: 3, label: "Fuerte" };
  if (password.length >= 16 || classes >= 3) return { level: 2, label: "Buena" };
  return { level: 1, label: "Aceptable" };
}

export function changePasswordProblems(form: { current: string; next: string; confirm: string }): string[] {
  const problems: string[] = [];
  if (!form.current) problems.push("Escribí tu contraseña actual.");
  problems.push(...passwordProblems(form.next));
  if (form.next && form.confirm !== form.next) problems.push("Las contraseñas nuevas no coinciden.");
  if (form.current && form.next && form.current === form.next) problems.push("La contraseña nueva tiene que ser distinta de la actual.");
  return problems;
}

// ---------------------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------------------

export interface NewUserForm {
  name: string;
  email: string;
  role: Role;
  password: string;
}

export const emptyUserForm = (): NewUserForm => ({ name: "", email: "", role: "programmer", password: "" });

export function newUserProblems(form: NewUserForm): string[] {
  const problems: string[] = [];
  if (!form.name.trim()) problems.push("Poné el nombre de la persona.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) problems.push("El email no es válido.");
  problems.push(...passwordProblems(form.password));
  return problems;
}

export const newUserPayload = (form: NewUserForm) => ({
  name: form.name.trim(),
  email: form.email.trim().toLowerCase(),
  role: form.role,
  password: form.password,
});

// ---------------------------------------------------------------------------
// Motor de audio
// ---------------------------------------------------------------------------

/** Mismo criterio que la API: conectado si consultó en los últimos 90 segundos. */
export const ENGINE_ONLINE_WINDOW_MS = 90_000;

export type EngineStatus = "online" | "offline" | "never";

export function engineStatus(lastSeenAt: string | null, now: number): EngineStatus {
  if (!lastSeenAt) return "never";
  return now - Date.parse(lastSeenAt) <= ENGINE_ONLINE_WINDOW_MS ? "online" : "offline";
}

/** Línea para el archivo .env del servidor donde corre el motor de audio. */
export const tokenEnvLine = (token: string) => `NUBERA_AGENT_TOKEN=${token}`;

export function tokenProblems(name: string): string[] {
  return name.trim() ? [] : ["Poné un nombre para reconocer el token (por ejemplo, el del estudio principal)."];
}

// ---------------------------------------------------------------------------
// Zonas horarias
// ---------------------------------------------------------------------------

export const TIME_ZONES: { id: string; label: string }[] = [
  { id: "America/Argentina/Buenos_Aires", label: "Argentina (Buenos Aires)" },
  { id: "America/Argentina/Cordoba", label: "Argentina (Córdoba)" },
  { id: "America/Argentina/Mendoza", label: "Argentina (Mendoza)" },
  { id: "America/Argentina/Tucuman", label: "Argentina (Tucumán)" },
  { id: "America/Argentina/Ushuaia", label: "Argentina (Ushuaia)" },
  { id: "America/Montevideo", label: "Uruguay (Montevideo)" },
  { id: "America/Asuncion", label: "Paraguay (Asunción)" },
  { id: "America/Santiago", label: "Chile (Santiago)" },
  { id: "America/La_Paz", label: "Bolivia (La Paz)" },
  { id: "America/Lima", label: "Perú (Lima)" },
  { id: "America/Bogota", label: "Colombia (Bogotá)" },
  { id: "America/Caracas", label: "Venezuela (Caracas)" },
  { id: "America/Guayaquil", label: "Ecuador (Guayaquil)" },
  { id: "America/Sao_Paulo", label: "Brasil (São Paulo)" },
  { id: "America/Mexico_City", label: "México (Ciudad de México)" },
  { id: "America/New_York", label: "Estados Unidos (Nueva York)" },
  { id: "America/Los_Angeles", label: "Estados Unidos (Los Ángeles)" },
  { id: "Europe/Madrid", label: "España (Madrid)" },
  { id: "UTC", label: "UTC" },
];

/** La lista de zonas; si la de la emisora no figura (se cargó por otra vía), se agrega para no perderla. */
export function timeZoneOptions(current: string): { id: string; label: string }[] {
  return TIME_ZONES.some((zone) => zone.id === current) ? TIME_ZONES : [{ id: current, label: current }, ...TIME_ZONES];
}
