import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { initializeFrontendSentry } from "@/lib/monitoring";
import NetworkStatusBanner from "@/components/network-status-banner";

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


function Router() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [, setLocation] = useLocation();

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  // Debug info for production
  if (typeof window !== 'undefined') {
    console.log('Auth state:', { isAuthenticated, isLoading, hasUser: !!user });
    // Additional debugging for white screen issue
    if (!isLoading && !isAuthenticated) {
      console.log('Rendering landing page for unauthenticated user');
    }
  }

  return (
    <Switch>
      {!isAuthenticated ? (
        <>
          <Route path="/" component={Landing} />
          <Route path="/login" component={Login} />
          <Route path="/register" component={Register} />
          <Route path="/forgot-password" component={ForgotPassword} />
          <Route path="/reset-password" component={ResetPassword} />
          <Route path="/pricing" component={Pricing} />
          <Route path="/blog" component={Blog} />
          <Route path="/blog/:slug" component={BlogPost} />
          {/* Redirect protected routes to login */}


          <Route path="/settings">
            {() => { setLocation("/login"); return null; }}
          </Route>
          <Route path="/support">
            {() => { setLocation("/login"); return null; }}
          </Route>
          <Route path="/admin">
            {() => { setLocation("/login"); return null; }}
          </Route>

        </>
      ) : (
        <>
          <Route path="/" component={InsightsFirstPage} />
          <Route path="/documents" component={UnifiedDocuments} />

          <Route path="/document/:id" component={DocumentPage} />
          <Route path="/settings" component={Settings} />
          <Route path="/support" component={Support} />
          <Route path="/admin" component={AdminDashboard} />
          <Route path="/admin/feature-flags" component={FeatureFlagsAdmin} />
          <Route path="/pricing" component={Pricing} />

          <Route path="/blog" component={Blog} />
          <Route path="/blog/:slug" component={BlogPost} />
          {/* Redirect auth routes to home for logged in users */}
          <Route path="/login">
            {() => { setLocation("/"); return null; }}
          </Route>
          <Route path="/register">
            {() => { setLocation("/"); return null; }}
          </Route>
          <Route path="/forgot-password">
            {() => { setLocation("/"); return null; }}
          </Route>
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <NetworkStatusBanner />
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;