import * as React from "react";
import { CATEGORY_COLOR, CATEGORY_LABEL, type AssetCategory } from "@/lib/categories";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "warning" | "danger" | "brand";

const TONES: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground ring-border",
  success: "bg-success/12 text-success ring-success/25",
  warning: "bg-warning/12 text-warning ring-warning/25",
  danger: "bg-destructive/12 text-destructive ring-destructive/25",
  brand: "bg-primary/12 text-primary ring-primary/25",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

/** Etiqueta con el color propio de cada categoría de audio. */
export function CategoryBadge({ category, className }: { category: AssetCategory; className?: string }) {
  return (
    <span
      style={{ "--c": CATEGORY_COLOR[category] } as React.CSSProperties}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-(--c)/12 px-2 py-0.5 text-[11px] font-medium text-(--c) ring-1 ring-inset ring-(--c)/25",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-(--c)" aria-hidden />
      {CATEGORY_LABEL[category]}
    </span>
  );
}
