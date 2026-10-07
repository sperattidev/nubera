"use client";

import type { Permission } from "@nubera/core";
import { CalendarClock, History, Library, Radio, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
}

const ITEMS: NavItem[] = [
  { href: "/aire", label: "Aire", icon: Radio, permission: "plays:read" },
  { href: "/programacion", label: "Programación", icon: CalendarClock, permission: "schedule:read" },
  { href: "/biblioteca", label: "Biblioteca", icon: Library, permission: "assets:read" },
  { href: "/historial", label: "Historial", icon: History, permission: "plays:read" },
];

export function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { allowed } = useSession();

  return (
    <nav aria-label="Principal" className="grid gap-1">
      {ITEMS.filter((item) => allowed(item.permission)).map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            {active && <span className="absolute -left-3 top-2 bottom-2 w-1 rounded-full bg-primary" aria-hidden />}
            <Icon className={cn("size-[18px]", active && "text-primary")} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
