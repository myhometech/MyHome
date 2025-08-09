import React from "react";
import { useQuery } from "@tanstack/react-query";

// Define feature names directly in the hook file for now
export type FeatureName = 
  | 'DOCUMENT_UPLOAD'
  | 'BASIC_ORGANIZATION' 
  | 'BASIC_SEARCH'
  | 'DOCUMENT_PREVIEW'
  | 'BASIC_SCANNER'
  | 'OCR_TEXT_EXTRACTION'
  | 'SMART_SEARCH'
  | 'EXPIRY_MANAGEMENT'
  | 'ADVANCED_SCANNER'
  | 'BULK_OPERATIONS'
  | 'CUSTOM_TAGS'
  | 'AI_SUMMARIZATION'
  | 'AI_TAG_SUGGESTIONS'
  | 'AI_CHATBOT'
  | 'EMAIL_IMPORT'
  | 'EXPIRY_REMINDERS'
  | 'DOCUMENT_SHARING';

interface UseFeatureResult {
  isEnabled: boolean;
  isLoading: boolean;
  error: any;
}

interface UseFeaturesResult {
  features: Record<FeatureName, boolean>;
  isLoading: boolean;
  error: any;
  hasFeature: (featureName: FeatureName) => boolean;
}

/**
 * Hook to check if a single feature is enabled for the current user
 */
export function useFeature(featureName: FeatureName): UseFeatureResult {
  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/feature-flags', featureName, 'check'],
    queryFn: async () => {
      const response = await fetch(`/api/feature-flags/${featureName}/check`);
      if (!response.ok) {
        throw new Error('Failed to check feature flag');
      }
      return response.json();
    },
    staleTime: 60000, // Cache for 1 minute
    retry: 2,
  });

  return {
    isEnabled: data?.enabled || false,
    isLoading,
    error,
  };
}

/**
 * Hook to get all enabled features for the current user
 * This is more efficient than calling multiple individual feature checks
 */
export function useFeatures(): UseFeaturesResult {
  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/feature-flags/batch-evaluation'],
    queryFn: async () => {
      const response = await fetch('/api/feature-flags/batch-evaluation');
      if (!response.ok) {
        throw new Error('Failed to get feature flags');
      }
      return response.json();
    },
    staleTime: 60000, // Cache for 1 minute
    retry: 2,
  });

  const enabledFeatures = data?.enabledFeatures || [];
  
  // Define all possible features
  const allFeatures: FeatureName[] = [
    'DOCUMENT_UPLOAD', 'BASIC_ORGANIZATION', 'BASIC_SEARCH', 'DOCUMENT_PREVIEW', 
    'BASIC_SCANNER', 'OCR_TEXT_EXTRACTION', 'SMART_SEARCH', 'EXPIRY_MANAGEMENT',
    'ADVANCED_SCANNER', 'BULK_OPERATIONS', 'CUSTOM_TAGS', 'AI_SUMMARIZATION',
    'AI_TAG_SUGGESTIONS', 'AI_CHATBOT', 'EMAIL_IMPORT', 'EXPIRY_REMINDERS', 'DOCUMENT_SHARING'
  ];
  
  // Convert array of enabled features to object for easy lookup
  const features = allFeatures.reduce((acc, featureName) => {
    acc[featureName] = enabledFeatures.includes(featureName);
    return acc;
  }, {} as Record<FeatureName, boolean>);

  const hasFeature = (featureName: FeatureName): boolean => {
    return features[featureName] || false;
  };

  return {
    features,
    isLoading,
    error,
    hasFeature,
  };
}

/**
 * React component to conditionally render content based on feature flags
 */
interface FeatureGateProps {
  feature: FeatureName;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function FeatureGate({ feature, children, fallback = null }: FeatureGateProps): JSX.Element | null {
  const { isEnabled, isLoading } = useFeature(feature);

  if (isLoading) {
    return React.createElement('div', { 
      className: 'animate-pulse bg-gray-200 rounded h-4 w-16' 
    });
  }

  if (!isEnabled) {
    return fallback as JSX.Element | null;
  }

  return children as JSX.Element;
}

/**
 * Higher-order component to wrap components with feature gating
 */
export function withFeatureGate<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  featureName: FeatureName,
  fallback?: React.ComponentType<P>
) {
  return function FeatureGatedComponent(props: P) {
    const { isEnabled, isLoading } = useFeature(featureName);

    if (isLoading) {
      return React.createElement('div', { 
        className: 'animate-pulse bg-gray-200 rounded h-4 w-16' 
      });
    }

    if (!isEnabled) {
      return fallback ? React.createElement(fallback, props) : null;
    }

    return React.createElement(WrappedComponent, props);
  };
}