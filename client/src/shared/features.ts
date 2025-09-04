/**
 * Shared feature flags visible to the frontend.
 * Replace defaults with your real remote-config or env-driven values.
 */
export type FeatureKey =
  | "newInsights"
  | "scanFlowV2"
  | "aiSuggestions"
  | "adminPanels";

/** Feature map. Toggle to enable/disable UI features. */
export const FEATURES: Record<FeatureKey, boolean> = {
  newInsights: true,
  scanFlowV2: true,
  aiSuggestions: true,
  adminPanels: true,
};

/** Helper used across the app */
export function isFeatureEnabled(key: FeatureKey): boolean {
  return !!FEATURES[key];
}

/** Optional default export in case some files import default */
export default FEATURES;
