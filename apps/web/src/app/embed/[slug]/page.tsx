import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RadioPlayer } from "@/components/public/radio-player";
import { getPublicStation } from "@/lib/public-station";

type Props = { params: Promise<{ slug: string }> };

// Es un fragmento para incrustar en otros sitios: no se indexa por separado.
export const metadata: Metadata = { title: "Reproductor", robots: { index: false, follow: false } };

export default async function EmbedPage({ params }: Props) {
  const { slug } = await params;
  const station = await getPublicStation(slug);
  if (!station) {
    notFound();
  }
  return <RadioPlayer initial={station} variant="embed" />;
}
