import { cn } from "@/lib/utils";

/** Marca de Nubera: una nube hecha de barras de onda. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid size-8 place-items-center rounded-[10px] bg-gradient-to-br from-primary to-[#b18cff] shadow-[0_6px_18px_-6px_color-mix(in_oklab,var(--primary)_80%,transparent)]",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round">
        <path d="M5 14v-2M9 17V9M13 20V6M17 16v-4M21 14v-2" />
      </svg>
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-[17px] font-semibold tracking-tight">Nubera</span>
    </span>
  );
}
