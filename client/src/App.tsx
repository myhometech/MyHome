import { Switch, Route, useLocation, Redirect } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { initializeFrontendSentry } from "@/lib/monitoring";
import NetworkStatusBanner from "@/components/network-status-banner";
import { ConfigProvider } from "@/components/ConfigProvider";

// Initialize frontend error tracking
try {
  initializeFrontendSentry();
} catch (error) {
  console.error('Failed to initialize Sentry:', error);
}
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Home from "@/pages/home";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Blog from "@/pages/blog";
import BlogPost from "@/pages/blog-post";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";


import Settings from "@/pages/settings";
import AdminDashboard from "@/pages/admin";
import FeatureFlagsAdmin from "@/pages/admin/feature-flags";
import Pricing from "@/pages/pricing";

import DocumentPage from "@/pages/document";
import UnifiedDocuments from "@/pages/unified-documents";
import InsightsFirstPage from "@/pages/insights-first";
import { Support } from "@/pages/support";

// Placeholder imports for routes that were added in the changes
import Insights from "@/pages/insights"; // Assuming this path exists
import InsightsFirst from "@/pages/insights-first"; // Assuming this path exists
import SharedWithMe from "@/pages/shared-with-me"; // Assuming this path exists
import FeatureFlagsPage from "@/pages/admin/feature-flags"; // Assuming this path exists


function Router() {
  const { user = null, isLoading, refetch } = useAuth();
  const [, setLocation] = useLocation();

  // Re-check auth on page focus to handle OAuth redirects
  useEffect(() => {
    const handleFocus = () => {
      console.log('[APP] Window focused, re-checking auth...');
      refetch();
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [refetch]);

  console.log('[APP] Router rendering - User:', user?.id || 'none', 'Loading:', isLoading);

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  console.log('App component rendering with user:', user, 'loading:', isLoading);
  console.log('Auth state:', {
    isAuthenticated: !!user,
    isLoading,
    hasUser: !!user
  });

  // Handle routing for both authenticated and unauthenticated users
  return (
    <Switch>
      {!user ? (
        // Unauthenticated routes
        <>
          <Route path="/login" component={Login} />
          <Route path="/register" component={Register} />
          <Route path="/forgot-password" component={ForgotPassword} />
          <Route path="/reset-password" component={ResetPassword} />
          <Route path="/pricing" component={Pricing} />
          <Route path="/blog" component={Blog} />
          <Route path="/blog/:slug" component={BlogPost} />
          <Route path="/support" component={Support} />
          <Route path="/" component={Landing} />
          {/* Catch-all for unauthenticated users to redirect to landing */}
          <Route component={Landing} />
        </>
      ) : (
        // Authenticated routes
        <>
          <Route path="/" component={Home} />
          <Route path="/documents" component={UnifiedDocuments} />
          <Route path="/document/:id" component={DocumentPage} />
          <Route path="/insights" component={Insights} />
          <Route path="/insights-first" component={InsightsFirst} />
          <Route path="/settings" component={Settings} />
          <Route path="/shared-with-me" component={SharedWithMe} />
          <Route path="/admin" component={AdminDashboard} />
          <Route path="/admin/feature-flags" component={FeatureFlagsPage} />
          {/* Redirect auth routes to home for logged in users */}
          <Route path="/login" component={() => <Redirect to="/" />} />
          <Route path="/register" component={() => <Redirect to="/" />} />
          <Route path="/forgot-password" component={() => <Redirect to="/" />} />
          <Route path="/reset-password" component={() => <Redirect to="/" />} />
          {/* Catch-all for authenticated users to redirect to NotFound */}
          <Route component={NotFound} />
        </>
      )}
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ConfigProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <NetworkStatusBanner />
            <Router />
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </ConfigProvider>
    </ErrorBoundary>
  );
}

export default App;