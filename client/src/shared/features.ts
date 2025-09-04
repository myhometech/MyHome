/**
 * Minimal feature flag registry stub.
 * Replace with your real flags/remote config when ready.
 */
export type FeatureKey =
  | "newInsights"
  | "scanFlowV2"
  | "aiSuggestions"
  | "adminPanels";

const flags: Record<FeatureKey, boolean> = {
  newInsights: true,
  scanFlowV2: true,
  aiSuggestions: true,
  adminPanels: true,
};

export function isFeatureEnabled(key: FeatureKey): boolean {
  return !!flags[key];
}

export const allFeatures = flags;
