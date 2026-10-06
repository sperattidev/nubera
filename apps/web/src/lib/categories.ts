import { ASSET_CATEGORIES, type AssetCategory } from "@nubera/core";

export { ASSET_CATEGORIES, type AssetCategory };

export const CATEGORY_LABEL: Record<AssetCategory, string> = {
  music: "Música",
  jingle: "Jingle",
  institutional: "Institucional",
  ad: "Publicidad",
  sweeper: "Cortina",
  other: "Otro",
};

/** Variable CSS con el color de cada categoría (definidas en globals.css). */
export const CATEGORY_COLOR: Record<AssetCategory, string> = {
  music: "var(--cat-music)",
  jingle: "var(--cat-jingle)",
  institutional: "var(--cat-institutional)",
  ad: "var(--cat-ad)",
  sweeper: "var(--cat-sweeper)",
  other: "var(--cat-other)",
};

export function isCategory(value: string | null | undefined): value is AssetCategory {
  return !!value && (ASSET_CATEGORIES as readonly string[]).includes(value);
}
