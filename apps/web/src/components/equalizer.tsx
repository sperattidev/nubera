import { cn } from "@/lib/utils";

// Alturas y tiempos distintos para que parezca un espectro real y no un patrón.
const PROFILE = [0.55, 0.9, 0.4, 1, 0.7, 0.3, 0.85, 0.6, 0.95, 0.45, 0.8, 0.35, 0.75, 0.5, 1, 0.65];

/**
 * Espectro animado. Es decorativo (`aria-hidden`); con `active={false}` queda quieto.
 */
export function Equalizer({
  bars = 5,
  active = true,
  className,
}: {
  bars?: number;
  active?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-end gap-[3px]", className)} aria-hidden>
      {Array.from({ length: bars }, (_, index) => {
        const height = PROFILE[index % PROFILE.length]!;
        return (
          <span
            key={index}
            className={cn("eq-bar w-full flex-1 rounded-full bg-current", !active && "!animate-none")}
            style={{
              height: `${height * 100}%`,
              animationDuration: `${0.7 + ((index * 37) % 60) / 100}s`,
              animationDelay: `${-((index * 53) % 90) / 100}s`,
              transform: active ? undefined : "scaleY(0.2)",
              opacity: active ? 1 : 0.35,
            }}
          />
        );
      })}
    </div>
  );
}
