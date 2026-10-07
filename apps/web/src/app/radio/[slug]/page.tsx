import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RadioPlayer } from "@/components/public/radio-player";
import { getPublicStation } from "@/lib/public-station";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const station = await getPublicStation(slug);
  if (!station) {
    return { title: "Radio no encontrada", robots: { index: false } };
  }
  const title = `${station.name} en vivo`;
  const description = `Escuchá ${station.name} en vivo, desde el celular o la computadora.`;
  return {
    title: { absolute: title },
    description,
    robots: { index: true, follow: true },
    openGraph: { title, description, type: "website", locale: "es_AR" },
  };
}

export default async function RadioPage({ params }: Props) {
  const { slug } = await params;
  const station = await getPublicStation(slug);
  if (!station) {
    notFound();
  }
  return <RadioPlayer initial={station} variant="page" />;
}
