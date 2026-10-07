"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AudioPlayerProvider, useAudioPlayer } from "@/lib/audio-player";
import { SessionProvider } from "@/lib/session";
import type { SessionUser, Station } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AudioBar } from "./audio-bar";
import { Logo, LogoMark } from "./logo";
import { Nav } from "./nav";
import { StationSwitcher } from "./station-switcher";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

function Frame({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { track } = useAudioPlayer();

  return (
    <div className="min-h-dvh">
      {/* Barra lateral (escritorio) */}
      <aside className="fixed inset-y-0 left-0 z-30 print:hidden hidden w-64 flex-col gap-8 border-r border-border bg-sidebar px-5 py-6 lg:flex">
        <Logo />
        <Nav />
        <p className="mt-auto text-xs text-muted-foreground">Nubera · panel de radio</p>
      </aside>

      <div className="lg:pl-64 print:pl-0">
        <header className="sticky top-0 z-20 print:hidden flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMenuOpen(true)} aria-label="Abrir menú">
            <Menu />
          </Button>
          {/* En pantallas chicas solo el ícono, para dejar lugar al nombre de la emisora. */}
          <LogoMark className="sm:hidden" />
          <Logo className="hidden sm:inline-flex lg:hidden" />
          <div className="hidden lg:block">
            <StationSwitcher />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="lg:hidden">
              <StationSwitcher />
            </div>
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>

        <main className={cn("mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8", track && "pb-28")}>{children}</main>
      </div>

      <AudioBar />

      {/* Menú (móvil) */}
      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent
          hideClose
          className="sheet left-0 top-0 h-full max-h-none w-72 max-w-72 translate-x-0 translate-y-0 content-start gap-8 rounded-none border-y-0 border-l-0 bg-sidebar"
        >
          <DialogTitle className="sr-only">Menú</DialogTitle>
          <DialogDescription className="sr-only">Navegación principal</DialogDescription>
          <Logo />
          <Nav onNavigate={() => setMenuOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AppShell({
  user,
  stations,
  initialStationId,
  children,
}: {
  user: SessionUser;
  stations: Station[];
  initialStationId: string | null;
  children: React.ReactNode;
}) {
  return (
    <SessionProvider user={user} stations={stations} initialStationId={initialStationId}>
      <AudioPlayerProvider>
        <Frame>{children}</Frame>
      </AudioPlayerProvider>
    </SessionProvider>
  );
}
