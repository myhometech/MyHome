// Feature flagging system for free vs premium tiers
export type SubscriptionTier = 'free' | 'premium';

export interface FeatureFlag {
  name: string;
  description: string;
  tier: SubscriptionTier;
  category: 'core' | 'advanced' | 'ai' | 'automation' | 'collaboration';
}

// Feature definitions based on user value ranking
export const FEATURES: Record<string, FeatureFlag> = {
  // Core Features (Free Tier)
  DOCUMENT_UPLOAD: {
    name: 'Document Upload & Storage',
    description: 'Upload and store documents securely',
    tier: 'free',
    category: 'core'
  },
  BASIC_ORGANIZATION: {
    name: 'Basic Organization',
    description: 'Organize documents with predefined categories',
    tier: 'free',
    category: 'core'
  },
  BASIC_SEARCH: {
    name: 'Basic Search',
    description: 'Search documents by name and basic metadata',
    tier: 'free',
    category: 'core'
  },
  DOCUMENT_PREVIEW: {
    name: 'Document Preview',
    description: 'View documents in-app',
    tier: 'free',
    category: 'core'
  },
  BASIC_SCANNER: {
    name: 'Basic Camera Scanner',
    description: 'Take photos of documents with basic scanner',
    tier: 'free',
    category: 'core'
  },

  // Advanced Features (Premium Tier)
  OCR_TEXT_EXTRACTION: {
    name: 'OCR Text Extraction',
    description: 'Extract and search text from images and PDFs',
    tier: 'premium',
    category: 'advanced'
  },
  SMART_SEARCH: {
    name: 'Smart Search',
    description: 'Advanced search with OCR content and smart filtering',
    tier: 'premium',
    category: 'advanced'
  },
  EXPIRY_MANAGEMENT: {
    name: 'Expiry Date Management',
    description: 'Track document expiry dates with alerts',
    tier: 'premium',
    category: 'advanced'
  },
  ADVANCED_SCANNER: {
    name: 'Advanced Camera Scanner',
    description: 'Professional document scanning with auto-enhancement',
    tier: 'premium',
    category: 'advanced'
  },
  BULK_OPERATIONS: {
    name: 'Bulk Operations',
    description: 'Batch operations on multiple documents',
    tier: 'premium',
    category: 'advanced'
  },
  CUSTOM_TAGS: {
    name: 'Custom Tags',
    description: 'Add custom tags to organize documents',
    tier: 'premium',
    category: 'advanced'
  },

  // AI Features (Premium Tier)
  AI_SUMMARIZATION: {
    name: 'AI Document Summarization',
    description: 'Get AI-powered summaries of your documents',
    tier: 'premium',
    category: 'ai'
  },
  AI_TAG_SUGGESTIONS: {
    name: 'AI Tag Suggestions',
    description: 'Smart tag suggestions based on document content',
    tier: 'premium',
    category: 'ai'
  },
  AI_CHATBOT: {
    name: 'AI Assistant',
    description: 'Chat with AI about your documents',
    tier: 'premium',
    category: 'ai'
  },

  // Automation Features (Premium Tier)
  EMAIL_IMPORT: {
    name: 'Email Import',
    description: 'Automatically import documents from email',
    tier: 'premium',
    category: 'automation'
  },
  EXPIRY_REMINDERS: {
    name: 'Smart Reminders',
    description: 'Automated reminders for renewals and deadlines',
    tier: 'premium',
    category: 'automation'
  },

  // Collaboration Features (Premium Tier)
  DOCUMENT_SHARING: {
    name: 'Document Sharing',
    description: 'Share documents with family members',
    tier: 'premium',
    category: 'collaboration'
  }
};

// Free tier limits
export const FREE_TIER_LIMITS = {
  MAX_DOCUMENTS: 50,
  MAX_STORAGE_MB: 100,
  MAX_CATEGORIES: 8, // Predefined only
  MAX_TAGS_PER_DOCUMENT: 0, // No custom tags
  OCR_PROCESSING: false,
  AI_FEATURES: false
};

// Premium tier limits
export const PREMIUM_TIER_LIMITS = {
  MAX_DOCUMENTS: 10000,
  MAX_STORAGE_MB: 10000, // 10GB
  MAX_CATEGORIES: 50, // Custom categories allowed
  MAX_TAGS_PER_DOCUMENT: 20,
  OCR_PROCESSING: true,
  AI_FEATURES: true
};

// Helper functions
export function hasFeature(userTier: SubscriptionTier, featureKey: keyof typeof FEATURES): boolean {
  const feature = FEATURES[featureKey];
  if (!feature) return false;
  
  if (feature.tier === 'free') return true;
  return userTier === 'premium';
}

export function getTierLimits(tier: SubscriptionTier) {
  return tier === 'premium' ? PREMIUM_TIER_LIMITS : FREE_TIER_LIMITS;
}

export function getFeaturesForTier(tier: SubscriptionTier): FeatureFlag[] {
  return Object.values(FEATURES).filter(feature => 
    feature.tier === 'free' || tier === 'premium'
  );
}

export function getFeaturesByCategory(tier: SubscriptionTier, category: FeatureFlag['category']): FeatureFlag[] {
  return getFeaturesForTier(tier).filter(feature => feature.category === category);
}