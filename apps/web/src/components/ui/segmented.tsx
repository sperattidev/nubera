"use client";

import { cn } from "@/lib/utils";

interface Option<T extends string> {
  id: T;
  label: string;
}

/** Selector de una opción entre pocas, con aspecto de pestañas. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-lg border border-border bg-card/60 p-0.5", className)} role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          onClick={() => onChange(option.id)}
          className={cn(
            "rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors",
            value === option.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
