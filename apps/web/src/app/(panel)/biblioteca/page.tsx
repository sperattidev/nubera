import type { Metadata } from "next";
import { Suspense } from "react";
import { LibraryView } from "./library-view";

export const metadata: Metadata = { title: "Biblioteca" };

export default function LibraryPage() {
  // useSearchParams necesita un límite de Suspense.
  return (
    <Suspense>
      <LibraryView />
    </Suspense>
  );
}
