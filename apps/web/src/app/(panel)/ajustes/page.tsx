import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsView } from "./settings-view";

export const metadata: Metadata = { title: "Ajustes" };

export default function SettingsPage() {
  // useSearchParams necesita un límite de Suspense.
  return (
    <Suspense>
      <SettingsView />
    </Suspense>
  );
}
