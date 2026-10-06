export const ASSET_CATEGORIES = [
  "music",
  "jingle",
  "institutional",
  "ad",
  "sweeper",
  "other",
] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number];
