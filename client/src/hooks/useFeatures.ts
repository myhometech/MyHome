import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { hasFeature, getTierLimits, FEATURES, type SubscriptionTier } from "@shared/features";

export function useFeatures() {
  const { user, isAuthenticated } = useAuth();
  
  // Get subscription status from Stripe API
  const { data: subscriptionStatus } = useQuery({
    queryKey: ['/api/stripe/subscription-status'],
    enabled: isAuthenticated,
    staleTime: 30000, // Cache for 30 seconds
  });

  // Determine user tier from either Stripe status or user profile
  const userTier: SubscriptionTier = (subscriptionStatus as any)?.tier || (user as any)?.subscriptionTier || 'free';

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