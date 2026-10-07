import type { Metadata } from "next";
import { Suspense } from "react";
import { AdsView } from "./ads-view";

export const metadata: Metadata = { title: "Publicidad" };

export default function AdsPage() {
  // useSearchParams necesita un límite de Suspense.
  return (
    <Suspense>
      <AdsView />
    </Suspense>
  );
}
