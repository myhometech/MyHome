import { useAuth } from "@/hooks/useAuth";
import { hasFeature, getTierLimits, FEATURES, type SubscriptionTier } from "@shared/features";

export function useFeatures() {
  const { user } = useAuth();
  const userTier: SubscriptionTier = (user as any)?.subscriptionTier || 'free';

  const checkFeature = (featureKey: keyof typeof FEATURES): boolean => {
    return hasFeature(userTier, featureKey);
  };

  const limits = getTierLimits(userTier);

  const isPremium = userTier === 'premium';
  const isFree = userTier === 'free';

  return {
    userTier,
    isPremium,
    isFree,
    checkFeature,
    limits,
    features: FEATURES
  };
}