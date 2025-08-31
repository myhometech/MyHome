import React, { Component, ErrorInfo, ReactNode } from 'react';
import { captureReactError } from '@/lib/monitoring';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('🚨 ErrorBoundary caught an error:', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      errorInfo,
      route: window.location.pathname,
      timestamp: new Date().toISOString()
    });
    
    // Update state with error info
    this.setState({ errorInfo });
    
    // Capture error in Sentry with React context
    captureReactError(error, {
      componentStack: errorInfo.componentStack || '',
      route: window.location.pathname,
      userAction: 'Component rendering',
    });
    
    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      // Emergency bypass - if user clicks "Force Load App", bypass error boundary
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('bypass') === 'true') {
        console.log('🚨 BYPASSING ERROR BOUNDARY - forcing app load');
        return this.props.children;
      }

      // Auto-bypass on mobile after 3 seconds if user hasn't interacted
      setTimeout(() => {
        if (this.state.hasError && !urlParams.get('bypass')) {
          console.log('🚨 AUTO-BYPASSING ERROR BOUNDARY after 3 seconds');
          window.location.href = window.location.pathname + '?bypass=true';
        }
      }, 3000);

      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Mobile-friendly error UI that auto-bypasses
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
          <div className="max-w-sm w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 text-center">
            <div className="flex justify-center mb-4">
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
            
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Loading Error Detected
            </h1>
            
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Auto-bypassing in 3 seconds...
            </p>

            {/* Show simple error info */}
            {this.state.error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3 mb-4 text-left">
                <p className="text-xs text-red-800 dark:text-red-400 font-mono">
                  <strong>Error:</strong> {this.state.error.message}
                </p>
              </div>
            )}
            
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => {
                  window.location.href = window.location.pathname + '?bypass=true';
                }}
                variant="destructive"
                className="w-full text-sm"
              >
                🚨 Force Load Now
              </Button>
              
              <Button
                onClick={this.handleReload}
                variant="outline"
                className="w-full text-sm"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Reload Page
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Higher-order component for wrapping components with error boundary
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>
) {
  return function WrappedComponent(props: P) {
    return (
      <ErrorBoundary {...errorBoundaryProps}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}

// Default export (named export already exists on the class declaration)
export default ErrorBoundary;