"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, errorMessage } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/constants";
import { useSession } from "@/lib/session";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

export function UserMenu() {
  const { user } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();

  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch (error) {
      toast.error(errorMessage(error));
      return;
    }
    queryClient.clear();
    router.replace("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-primary/80 to-[#b18cff]/80 text-[13px] font-semibold text-white ring-2 ring-background transition-transform hover:scale-105"
        aria-label="Menú de usuario"
      >
        {initials(user.name)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="grid gap-0.5 py-2">
          <span className="text-sm font-medium text-foreground">{user.name}</span>
          <span className="font-normal">{user.email}</span>
          <span className="mt-1 font-normal text-primary">{ROLE_LABEL[user.role]}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={logout}>
          <LogOut /> Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
