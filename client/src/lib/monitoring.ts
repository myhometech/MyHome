import * as Sentry from '@sentry/react';

// Initialize Sentry for frontend error tracking
export function initializeFrontendSentry() {
  if (!import.meta.env.VITE_SENTRY_DSN) {
    console.log('✅ Sentry error tracking initialized for frontend (no DSN configured)');
    return;
  }

  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE || 'development',
    
    // Performance monitoring
    tracesSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 1.0,
    replaysSessionSampleRate: 0.1, // Capture 10% of sessions
    replaysOnErrorSampleRate: 1.0, // Capture 100% of sessions with errors
    
    integrations: [
      // Browser integrations
      Sentry.browserTracingIntegration(),
      // Session replay for debugging
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    
    beforeSend(event, hint) {
      // Filter out development noise
      if (import.meta.env.MODE === 'development') {
        const error = hint.originalException;
        if (error && typeof error === 'string') {
          // Skip common React development warnings
          if (error.includes('Warning:') || error.includes('React-Hot-Loader')) {
            return null;
          }
        }
      }
      
      // Add user context from localStorage or auth state
      try {
        const userData = localStorage.getItem('user');
        if (userData && !event.user) {
          const user = JSON.parse(userData);
          event.user = {
            id: user.id,
            email: user.email,
          };
        }
      } catch (e) {
        // Ignore localStorage errors
      }
      
      return event;
    },
    
    initialScope: {
      tags: {
        component: 'frontend',
        version: import.meta.env.VITE_APP_VERSION || '1.0.0',
      },
    },
  });

  console.log('✅ Sentry error tracking initialized for frontend');
}

// Enhanced error capture for React components
export function captureReactError(error: Error, errorInfo?: {
  componentStack?: string;
  userId?: string;
  route?: string;
  userAction?: string;
}) {
  Sentry.withScope((scope) => {
    // Add React-specific context
    if (errorInfo?.componentStack) {
      scope.setContext('react', {
        componentStack: errorInfo.componentStack,
      });
    }
    
    // Add user context
    if (errorInfo?.userId) {
      scope.setUser({ id: errorInfo.userId });
      scope.setTag('userId', errorInfo.userId);
    }
    
    // Add route context
    if (errorInfo?.route) {
      scope.setTag('route', errorInfo.route);
    }
    
    // Add user action context
    if (errorInfo?.userAction) {
      scope.setTag('userAction', errorInfo.userAction);
      scope.addBreadcrumb({
        message: `User performed: ${errorInfo.userAction}`,
        level: 'info',
        category: 'user-action',
      });
    }
    
    Sentry.captureException(error);
  });
}

// Performance monitoring for API calls
export function trackAPICall<T>(
  apiCall: () => Promise<T>,
  endpoint: string,
  method: string = 'GET'
): Promise<T> {
  return Sentry.startSpan({
    op: 'http.client',
    name: `${method} ${endpoint}`,
  }, async () => {
    try {
      const result = await apiCall();
      return result;
    } catch (error) {
      // Capture API errors with context
      captureReactError(error as Error, {
        route: window.location.pathname,
        userAction: `API call to ${endpoint}`,
      });
      throw error;
    }
  });
}

// User action tracking
export function trackUserAction(action: string, metadata?: Record<string, any>) {
  Sentry.addBreadcrumb({
    message: action,
    level: 'info',
    category: 'user-action',
    data: metadata,
  });
  
  // Also track as custom event for analytics
  Sentry.captureMessage(`User action: ${action}`, 'info');
}

// Performance timing utilities
export function measurePerformance<T>(
  operation: () => T,
  operationName: string
): T {
  const startTime = performance.now();
  
  try {
    const result = operation();
    
    // Handle both sync and async operations
    if (result instanceof Promise) {
      return result.then((value) => {
        const duration = performance.now() - startTime;
        Sentry.addBreadcrumb({
          message: `${operationName} completed`,
          level: 'info',
          category: 'performance',
          data: { duration: Math.round(duration) + 'ms' },
        });
        return value;
      }) as T;
    } else {
      const duration = performance.now() - startTime;
      Sentry.addBreadcrumb({
        message: `${operationName} completed`,
        level: 'info',
        category: 'performance',
        data: { duration: Math.round(duration) + 'ms' },
      });
      return result;
    }
  } catch (error) {
    const duration = performance.now() - startTime;
    captureReactError(error as Error, {
      userAction: operationName,
    });
    throw error;
  }
}

export { Sentry };