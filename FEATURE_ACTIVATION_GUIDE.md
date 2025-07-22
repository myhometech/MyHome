# Feature Flagging Activation Guide

## Current Status
**All features are currently available to everyone - no restrictions are active.**

The feature flagging infrastructure is built and ready but dormant. When you're ready to differentiate between free and premium users, follow this guide.

## How to Activate Feature Gating

### 1. Activate Feature Restrictions
In `shared/features.ts`, replace the temporary logic:

```typescript
// Change this:
export function hasFeature(userTier: SubscriptionTier, featureKey: keyof typeof FEATURES): boolean {
  return true; // TEMPORARY
}

// To this:
export function hasFeature(userTier: SubscriptionTier, featureKey: keyof typeof FEATURES): boolean {
  const feature = FEATURES[featureKey];
  if (!feature) return false;
  if (feature.tier === 'free') return true;
  return userTier === 'premium';
}
```

### 2. Activate Tier Limits
In the same file, change:

```typescript
// Change this:
export function getTierLimits(tier: SubscriptionTier) {
  return PREMIUM_TIER_LIMITS; // TEMPORARY
}

// To this:
export function getTierLimits(tier: SubscriptionTier) {
  return tier === 'premium' ? PREMIUM_TIER_LIMITS : FREE_TIER_LIMITS;
}
```

### 3. Activate Tier-Based Feature Lists
```typescript
// Change this:
export function getFeaturesForTier(tier: SubscriptionTier): FeatureFlag[] {
  return Object.values(FEATURES); // TEMPORARY
}

// To this:
export function getFeaturesForTier(tier: SubscriptionTier): FeatureFlag[] {
  return Object.values(FEATURES).filter(feature => 
    feature.tier === 'free' || tier === 'premium'
  );
}
```

## Feature Tier Breakdown

### Free Tier (Always Available)
- Document upload and storage (50 docs, 100MB)
- Basic categories and organization
- Simple search
- Mobile camera scanning
- Document viewing and downloading

### Premium Tier (Requires Subscription)
- **AI Features**: OCR text extraction, AI summarization, smart categorization
- **Automation**: Email import, expiry notifications, auto-tagging
- **Advanced Features**: Unlimited storage, custom categories, advanced search
- **Collaboration**: Document sharing, family access

## Testing Feature Gates

1. **Free User Test**: Set user's `subscriptionTier` to `'free'` in database
2. **Premium User Test**: Set user's `subscriptionTier` to `'premium'` in database
3. **Component Test**: Use `<FeatureGate feature="OCR_PROCESSING">` around premium features
4. **Hook Test**: Use `checkFeature('AI_SUMMARIZATION')` for conditional logic

## Database Update for Existing Users

```sql
-- Set all existing users to free tier (default)
UPDATE users SET subscription_tier = 'free' WHERE subscription_tier IS NULL;

-- Upgrade specific users to premium for testing
UPDATE users SET subscription_tier = 'premium' WHERE email = 'test@example.com';
```

## UI Components Ready for Activation

- `<FeatureGate>` - Hide/show features
- `<PremiumFeature>` - Show upgrade prompts
- `<FeatureLimitAlert>` - Warn about limits
- Pricing page with tier comparison
- Feature usage tracking hooks

When you activate the system, all existing users will default to the free tier and see the appropriate feature restrictions.