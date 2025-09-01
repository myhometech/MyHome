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
import { InsightsPage } from '@/pages/insights';
import Notifications from "@/pages/notifications";
import Tasks from "@/pages/tasks";
import Analytics from "@/pages/analytics";
import { Support } from "@/pages/support";
import { InviteAccept } from "@/pages/InviteAccept";
import ChatPage from "@/pages/chat";


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

  try {
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
            <Route path="/notifications">
              {() => { setLocation("/login"); return null; }}
            </Route>
            <Route path="/tasks">
              {() => { setLocation("/login"); return null; }}
            </Route>
            <Route path="/analytics">
              {() => { setLocation("/login"); return null; }}
            </Route>
            <Route path="/admin">
              {() => { setLocation("/login"); return null; }}
            </Route>
            <Route path="/document/:id">
              {() => { setLocation("/login"); return null; }}
            </Route>
            <Route path="/documents">
              {() => { setLocation("/login"); return null; }}
            </Route>
          </>
        ) : (
          <>
            <Route path="/" component={InsightsPage} />
            <Route path="/documents" component={UnifiedDocuments} />
            <Route path="/notifications" component={Notifications} />
            <Route path="/tasks" component={Tasks} />
            <Route path="/analytics" component={Analytics} />
            <Route path="/document/:id" component={DocumentPage} />
            <Route path="/settings" component={Settings} />
            <Route path="/support" component={Support} />
            <Route path="/chat" component={ChatPage} />
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
        {/* TICKET 5: Invite accept route accessible regardless of auth status */}
        <Route path="/invite/accept" component={InviteAccept} />
        <Route component={NotFound} />
      </Switch>
    );
  } catch (error) {
    console.error('🚨 Router rendering error:', error);
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
          <h1 className="text-xl font-semibold text-red-600 mb-2">Router Error</h1>
          <p className="text-gray-600 mb-4">
            Router failed to render: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
          <button 
            onClick={() => window.location.reload()} 
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }
}

function App() {
  // Emergency bypass: if user adds ?no-error-boundary=true, completely disable ErrorBoundary
  const urlParams = new URLSearchParams(window.location.search);
  const disableErrorBoundary = urlParams.get('no-error-boundary') === 'true';

  if (disableErrorBoundary) {
    console.log('🚨 ERROR BOUNDARY COMPLETELY DISABLED');
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <NetworkStatusBanner />
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

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