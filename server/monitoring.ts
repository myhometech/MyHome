import * as Sentry from '@sentry/node';

// Initialize Sentry for error tracking and performance monitoring
export function initializeSentry() {
  if (!process.env.SENTRY_DSN) {
    console.warn('⚠️  SENTRY_DSN not configured - error tracking disabled');
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    
    // Performance monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    
    // Enhanced error tracking
    integrations: [
      // HTTP request monitoring  
      Sentry.httpIntegration({ tracing: true }),
      // Console integration
      Sentry.consoleIntegration(),
      // OnUncaughtException integration
      Sentry.onUncaughtExceptionIntegration(),
    ],
    
    // Additional options
    beforeSend(event, hint) {
      // Filter out noise in development
      if (process.env.NODE_ENV === 'development') {
        const error = hint.originalException;
        if (error && typeof error === 'object' && 'code' in error) {
          // Skip common development connection errors
          if (['ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT'].includes(error.code as string)) {
            return null;
          }
        }
      }
      
      return event;
    },
    
    // Tag events with useful metadata
    initialScope: {
      tags: {
        component: 'backend',
        version: process.env.npm_package_version || '1.0.0',
      },
    },
  });

  console.log('✅ Sentry error tracking initialized for backend');
}

// Enhanced error capture with context
export function captureError(error: Error, context?: {
  userId?: string;
  route?: string;
  operation?: string;
  metadata?: Record<string, any>;
}) {
  Sentry.withScope((scope) => {
    // Add user context
    if (context?.userId) {
      scope.setUser({ id: context.userId });
      scope.setTag('userId', context.userId);
    }
    
    // Add route context
    if (context?.route) {
      scope.setTag('route', context.route);
      scope.setContext('route', { path: context.route });
    }
    
    // Add operation context
    if (context?.operation) {
      scope.setTag('operation', context.operation);
      scope.setContext('operation', { name: context.operation });
    }
    
    // Add custom metadata
    if (context?.metadata) {
      scope.setContext('metadata', context.metadata);
    }
    
    // Capture the error
    Sentry.captureException(error);
  });
}

// Performance transaction tracking
export function startTransaction(name: string, operation?: string) {
  return Sentry.startSpan({
    name,
    op: operation || 'http.server',
  }, () => {});
}

// Database performance monitoring
export function trackDatabaseQuery<T>(
  queryName: string,
  queryFn: () => Promise<T>,
  metadata?: Record<string, any>
): Promise<T> {
  return Sentry.startSpan({
    op: 'db.query',
    name: queryName,
  }, async () => {
    try {
      const result = await queryFn();
      return result;
    } catch (error) {
      captureError(error as Error, { 
        operation: 'database_query',
        metadata: { queryName, ...metadata }
      });
      throw error;
    }
  });
}

// Express middleware for request tracking
export function sentryRequestHandler() {
  return (req: any, res: any, next: any) => {
    // Simple request tracking
    Sentry.withScope((scope) => {
      scope.setTag('route', req.path);
      scope.setTag('method', req.method);
      if (req.user?.id) {
        scope.setUser({ id: req.user.id, email: req.user.email });
      }
    });
    next();
  };
}

export function sentryErrorHandler() {
  return (error: any, req: any, res: any, next: any) => {
    // Capture errors with context
    captureError(error, {
      userId: req.user?.id,
      route: req.path,
      operation: `${req.method} ${req.path}`,
    });
    next(error);
  };
}

// Health monitoring for critical systems
export function monitorSystemHealth() {
  setInterval(() => {
    try {
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      
      // Alert on high memory usage (> 512MB)
      if (memUsage.heapUsed > 512 * 1024 * 1024) {
        Sentry.addBreadcrumb({
          message: 'High memory usage detected',
          level: 'warning',
          data: {
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
          },
        });
      }
      
      // Monitor event loop lag
      const start = process.hrtime();
      setImmediate(() => {
        const delta = process.hrtime(start);
        const nanosec = delta[0] * 1e9 + delta[1];
        const millisec = nanosec / 1e6;
        
        // Alert on high event loop lag (> 100ms)
        if (millisec > 100) {
          Sentry.addBreadcrumb({
            message: 'High event loop lag detected',
            level: 'warning',
            data: { lag: Math.round(millisec) + 'ms' },
          });
        }
      });
      
    } catch (error) {
      console.error('System health monitoring error:', error);
    }
  }, 30000); // Check every 30 seconds
}

export { Sentry };