import type { Metadata } from "next";
import { OnAirView } from "./on-air-view";

export const metadata: Metadata = { title: "Aire" };

export default function OnAirPage() {
  return <OnAirView />;
}
