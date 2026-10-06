const LOCALE = "es-AR";

/** Instante como fecha, texto ISO o milisegundos (los relojes del panel trabajan en ms). */
type Instant = Date | string | number;

/** 1536000 → "1,5 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toLocaleString(LOCALE, { maximumFractionDigits: 1 })} ${units[unit]}`;
}

/** Milisegundos → "2:05" o "1:02:05". Nunca negativo. */
export function formatClockTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const two = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
}

/** Hora local de la emisora, "14:05". */
export function formatTime(date: Instant, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(date),
  );
}

/** Fecha y hora local de la emisora, "6 oct, 14:05". */
export function formatDateTime(date: Instant, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(date));
}

/** "hace 5 s", "hace 3 min", "hace 2 h"; más allá de un día, la fecha. */
export function formatRelative(date: Instant, now: Instant, timeZone: string): string {
  const seconds = Math.round((new Date(now).getTime() - new Date(date).getTime()) / 1000);
  if (seconds < 5) {
    return "ahora";
  }
  if (seconds < 60) {
    return `hace ${seconds} s`;
  }
  if (seconds < 3600) {
    return `hace ${Math.floor(seconds / 60)} min`;
  }
  if (seconds < 86_400) {
    return `hace ${Math.floor(seconds / 3600)} h`;
  }
  return formatDateTime(date, timeZone);
}
