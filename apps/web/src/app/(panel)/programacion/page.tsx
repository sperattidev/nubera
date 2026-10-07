import type { Metadata } from "next";
import { ScheduleView } from "./schedule-view";

export const metadata: Metadata = { title: "Programación" };

export default function SchedulePage() {
  return <ScheduleView />;
}
