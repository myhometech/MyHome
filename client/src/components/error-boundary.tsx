import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  retryCount: number;
}

export class ErrorBoundary extends Component<Props, State> {
  private retryTimeout: NodeJS.Timeout | null = null;

  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    retryCount: 0,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Error caught by boundary - logging removed for production
    
    this.setState({ errorInfo });
    
    // Call onError callback if provided
    this.props.onError?.(error, errorInfo);

    // Auto-retry after 5 seconds for network errors (max 2 retries)
    if (this.state.retryCount < 2 && this.isNetworkError(error)) {
      this.retryTimeout = setTimeout(() => {
        this.handleRetry();
      }, 5000);
    }
  }

  public componentWillUnmount() {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }
  }

  private isNetworkError(error: Error): boolean {
    return error.message.includes('fetch') || 
           error.message.includes('network') ||
           error.message.includes('NETWORK_ERROR') ||
           error.name === 'TypeError';
  }

  private handleRetry = () => {
    this.setState(prevState => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prevState.retryCount + 1,
    }));
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  private handleRefresh = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isNetworkError = this.state.error && this.isNetworkError(this.state.error);

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
          <Card className="max-w-lg w-full">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <AlertTriangle className="w-16 h-16 text-red-500" />
              </div>
              <CardTitle className="text-xl text-gray-900">
                {isNetworkError ? 'Connection Error' : 'Something went wrong'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-600 text-center">
                {isNetworkError 
                  ? 'Unable to connect to the server. Please check your internet connection.'
                  : 'An unexpected error occurred. Our team has been notified.'
                }
              </p>

              {this.state.retryCount < 2 && isNetworkError && (
                <p className="text-sm text-gray-500 text-center">
                  Auto-retry in progress... (Attempt {this.state.retryCount + 1}/3)
                </p>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <Button 
                  onClick={this.handleRetry}
                  className="flex-1"
                  variant="default"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Try Again
                </Button>
                <Button 
                  onClick={this.handleGoHome}
                  className="flex-1"
                  variant="outline"
                >
                  <Home className="w-4 h-4 mr-2" />
                  Go Home
                </Button>
              </div>

              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="mt-4 p-3 bg-gray-100 rounded text-xs">
                  <summary className="cursor-pointer font-medium text-gray-700">
                    Error Details (Development)
                  </summary>
                  <pre className="mt-2 text-red-600 whitespace-pre-wrap">
                    {this.state.error.toString()}
                    {this.state.errorInfo?.componentStack}
                  </pre>
                </details>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

// Component-level error boundary for smaller components
interface ComponentErrorBoundaryProps {
  children: ReactNode;
  componentName: string;
  fallback?: ReactNode;
}

export function ComponentErrorBoundary({ 
  children, 
  componentName, 
  fallback 
}: ComponentErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallback={fallback || (
        <div className="p-4 border border-red-200 bg-red-50 rounded-lg">
          <div className="flex items-center gap-2 text-red-800">
            <AlertTriangle className="w-5 h-5" />
            <span className="font-medium">Error in {componentName}</span>
          </div>
          <p className="text-sm text-red-600 mt-1">
            This component failed to load. Please refresh the page or try again.
          </p>
          <Button 
            size="sm" 
            variant="outline" 
            className="mt-2"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Reload
          </Button>
        </div>
      )}
      onError={(error) => {
        // Component error - logging removed for production
      }}
    >
      {children}
    </ErrorBoundary>
  );
}