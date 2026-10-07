"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";

export function ThemeToggle() {
  function toggle() {
    const dark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("nubera-theme", dark ? "dark" : "light");
    } catch {
      // Sin almacenamiento disponible: el cambio vale solo para esta sesión.
    }
  }

  return (
    <Hint label="Cambiar tema">
      <Button variant="ghost" size="icon" onClick={toggle} aria-label="Cambiar entre tema claro y oscuro">
        <Sun className="hidden dark:block" />
        <Moon className="dark:hidden" />
      </Button>
    </Hint>
  );
}
