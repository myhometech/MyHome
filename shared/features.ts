// Dynamic subscription tier type - supports arbitrary tier names via Stripe configuration  
export type SubscriptionTier = string;

export interface FeatureFlag {
  name: string;
  description: string;
  tier: SubscriptionTier | SubscriptionTier[];
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
    tier: ['beginner', 'pro', 'duo'],
    category: 'advanced'
  },
  SMART_SEARCH: {
    name: 'Smart Search',
    description: 'Advanced search with OCR content and smart filtering',
    tier: ['pro', 'duo'],
    category: 'advanced'
  },
  EXPIRY_MANAGEMENT: {
    name: 'Expiry Date Management',
    description: 'Track document expiry dates with alerts',
    tier: ['pro', 'duo'],
    category: 'advanced'
  },
  ADVANCED_SCANNER: {
    name: 'Advanced Camera Scanner',
    description: 'Professional document scanning with auto-enhancement',
    tier: ['beginner', 'pro', 'duo'],
    category: 'advanced'
  },
  BULK_OPERATIONS: {
    name: 'Bulk Operations',
    description: 'Batch operations on multiple documents',
    tier: ['pro', 'duo'],
    category: 'advanced'
  },
  CUSTOM_TAGS: {
    name: 'Custom Tags',
    description: 'Add custom tags to organize documents',
    tier: ['beginner', 'pro', 'duo'],
    category: 'advanced'
  },

  // AI Features (Premium Tier)
  AI_SUMMARIZATION: {
    name: 'AI Document Summarization',
    description: 'Get AI-powered summaries of your documents',
    tier: ['free', 'beginner', 'pro', 'duo'],
    category: 'ai'
  },
  AI_TAG_SUGGESTIONS: {
    name: 'AI Tag Suggestions',
    description: 'Smart tag suggestions based on document content',
    tier: ['pro', 'duo'],
    category: 'ai'
  },
  AI_CHATBOT: {
    name: 'AI Assistant',
    description: 'Chat with AI about your documents',
    tier: ['pro', 'duo'],
    category: 'ai'
  },

  // Chat System Features
  CHAT_ENABLED: {
    name: 'Chat System',
    description: 'Access to the AI chat system for document queries',
    tier: 'premium',
    category: 'ai'
  },
  CHAT_SHOW_FILTERS: {
    name: 'Advanced Chat Filters',
    description: 'Show advanced filters for provider, document type, and date in chat',
    tier: 'premium',
    category: 'ai'
  },
  CHAT_NUMERIC_VERIFIER: {
    name: 'Chat Numeric Verification',
    description: 'Enable numeric and date verification post-processing in chat responses',
    tier: 'premium',
    category: 'ai'
  },
  CHAT_USE_LLAMA: {
    name: 'Llama 3.3 Chat Models',
    description: 'Use Llama 3.3 models for chatbot responses instead of Mistral',
    tier: 'free', // Start with free tier for testing
    category: 'ai'
  },
  CHAT_USE_LLAMA_ACCURATE: {
    name: 'Llama 3.3 70B Accurate Model',
    description: 'Enable escalation to Llama 3.3 70B for complex queries and low confidence responses',
    tier: 'free', // Start with free tier for testing
    category: 'ai'
  },

  // Automation Features (Premium Tier)
  EMAIL_IMPORT: {
    name: 'Email Import',
    description: 'Automatically import documents from email',
    tier: ['pro', 'duo'],
    category: 'automation'
  },
  EMAIL_BODY_PDF_AUTO_WITH_ATTACHMENTS: {
    name: 'Auto Email Body PDF with Attachments',
    description: 'Automatically create email body PDF when email has attachments',
    tier: ['pro', 'duo'],
    category: 'automation'
  },
  EXPIRY_REMINDERS: {
    name: 'Smart Reminders',
    description: 'Automated reminders for renewals and deadlines',
    tier: ['pro', 'duo'],
    category: 'automation'
  },

  // Collaboration Features (Premium Tier)
  DOCUMENT_SHARING: {
    name: 'Document Sharing',
    description: 'Share documents with family members',
    tier: ['duo'],
    category: 'collaboration'
  },
  HOUSEHOLD_WORKSPACE: {
    name: 'Shared Household Workspace',
    description: 'Shared document workspace for family members',
    tier: ['duo'],
    category: 'collaboration'
  },
  INVITE_USERS: {
    name: 'Invite Family Members',
    description: 'Invite up to 2 family members to your workspace',
    tier: ['duo'],
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

// Beginner tier limits
export const BEGINNER_TIER_LIMITS = {
  MAX_DOCUMENTS: 200,
  MAX_STORAGE_MB: 500, // 500MB
  MAX_CATEGORIES: 15, // Custom categories allowed
  MAX_TAGS_PER_DOCUMENT: 5,
  OCR_PROCESSING: true,
  AI_FEATURES: false
};

// Pro tier limits
export const PRO_TIER_LIMITS = {
  MAX_DOCUMENTS: 5000,
  MAX_STORAGE_MB: 5000, // 5GB
  MAX_CATEGORIES: 30, // Custom categories allowed
  MAX_TAGS_PER_DOCUMENT: 15,
  OCR_PROCESSING: true,
  AI_FEATURES: true
};

// Duo tier limits (shared household workspace)
export const DUO_TIER_LIMITS = {
  MAX_DOCUMENTS: 10000, // Shared across household
  MAX_STORAGE_MB: 10000, // 10GB shared
  MAX_CATEGORIES: 50, // Custom categories allowed
  MAX_TAGS_PER_DOCUMENT: 20,
  OCR_PROCESSING: true,
  AI_FEATURES: true,
  SEAT_LIMIT: 2 // Maximum users in household
};

// Legacy premium tier limits (kept for backward compatibility)
export const PREMIUM_TIER_LIMITS = PRO_TIER_LIMITS;

// Helper functions
export function hasFeature(userTier: SubscriptionTier, featureKey: keyof typeof FEATURES): boolean {
  // TEMPORARY: All features available for now - change when ready to activate feature gating
  return true;
  
  // Updated feature gating logic for multi-tier plans (commented out for later activation):
  // const feature = FEATURES[featureKey];
  // if (!feature) return false;
  // if (Array.isArray(feature.tier)) {
  //   return feature.tier.includes(userTier);
  // }
  // return feature.tier === userTier || feature.tier === 'free';
}

export function getTierLimits(tier: SubscriptionTier) {
  // TEMPORARY: Return premium limits for everyone for now - change when ready to activate limits
  return PREMIUM_TIER_LIMITS;
  
  // Updated tier limits for multi-tier plans (commented out for later activation):
  // switch (tier) {
  //   case 'free': return FREE_TIER_LIMITS;
  //   case 'beginner': return BEGINNER_TIER_LIMITS;
  //   case 'pro': return PRO_TIER_LIMITS;
  //   case 'duo': return DUO_TIER_LIMITS;
  //   default: return FREE_TIER_LIMITS;
  // }
}

export function getFeaturesForTier(tier: SubscriptionTier): FeatureFlag[] {
  // TEMPORARY: Return all features for now - change when ready to activate feature gating
  return Object.values(FEATURES);
  
  // Original tier filtering (commented out for later activation):
  // return Object.values(FEATURES).filter(feature => 
  //   feature.tier === 'free' || tier === 'premium'
  // );
}

export function getFeaturesByCategory(tier: SubscriptionTier, category: FeatureFlag['category']): FeatureFlag[] {
  return getFeaturesForTier(tier).filter(feature => feature.category === category);
}