import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { STATION_COOKIE_NAME } from "@/lib/constants";
import { getSessionUser, getStations } from "@/lib/server";

// El estado de sesión depende de la cookie de cada visitante.
export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  const stations = await getStations();
  const initialStationId = (await cookies()).get(STATION_COOKIE_NAME)?.value ?? null;

  return (
    <AppShell user={user} stations={stations} initialStationId={initialStationId}>
      {children}
    </AppShell>
  );
}
