// Analytics utility for tracking user events
// TICKET 8: Analytics tracking for scan flow and other user interactions

interface AnalyticsEvent {
  action: string;
  category?: string;
  label?: string;
  value?: number;
  userId?: string;
  documentId?: number;
  timestamp?: string;
  [key: string]: any;
}

// Track scan flow events
export const trackScanEvent = (action: 'browser_scan_started' | 'browser_scan_uploaded' | 'browser_scan_ocr_failed' | 'browser_scan_insights_generated', data?: {
  userId?: string;
  documentId?: number;
  pageCount?: number;
  processingTime?: number;
  ocrError?: string;
  insightsCount?: number;
}) => {
  try {
    const event: AnalyticsEvent = {
      action,
      category: 'browser_scan',
      timestamp: new Date().toISOString(),
      ...data
    };

    // Send to Google Analytics if available
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', action, {
        event_category: 'browser_scan',
        user_id: data?.userId,
        document_id: data?.documentId,
        page_count: data?.pageCount,
        processing_time: data?.processingTime,
        ocr_error: data?.ocrError,
        insights_count: data?.insightsCount
      });
    }

    // Also track with Sentry for additional context
    if (typeof window !== 'undefined' && (window as any).Sentry) {
      (window as any).Sentry.addBreadcrumb({
        message: `Scan Event: ${action}`,
        category: 'analytics',
        level: 'info',
        data: event
      });
    }

    // Console log for debugging
    console.log('📊 Analytics:', action, event);
    
    return event;
  } catch (error) {
    console.warn('Failed to track scan event:', error);
  }
};

// General analytics tracking function
export const trackEvent = (action: string, category: string = 'user_action', data?: Partial<AnalyticsEvent>) => {
  try {
    const event: AnalyticsEvent = {
      action,
      category,
      timestamp: new Date().toISOString(),
      ...data
    };

    // Send to Google Analytics if available
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', action, {
        event_category: category,
        event_label: data?.label,
        value: data?.value,
        user_id: data?.userId
      });
    }

    // Console log for debugging
    console.log('📊 Analytics:', action, event);
    
    return event;
  } catch (error) {
    console.warn('Failed to track event:', error);
  }
};

// Add menu selection tracking (existing function)
export const trackAddMenuSelection = (action: 'important_date' | 'document_upload' | 'scan_document', context?: {
  selectedAssetId?: string;
  selectedAssetName?: string;
}) => {
  trackEvent('add_menu_selection', 'navigation', {
    label: action,
    ...context
  });
};

// Document interaction tracking
export const trackDocumentEvent = (action: string, documentId: number, data?: Partial<AnalyticsEvent>) => {
  trackEvent(action, 'document_interaction', {
    documentId,
    ...data
  });
};

// Upload tracking
export const trackUploadEvent = (action: 'upload_started' | 'upload_completed' | 'upload_failed', data?: {
  fileCount?: number;
  totalSize?: number;
  fileTypes?: string[];
  uploadSource?: string;
}) => {
  trackEvent(action, 'document_upload', data);
};