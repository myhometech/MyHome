import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { ErrorBoundary } from "@/components/error-boundary";
import { NetworkStatusBanner } from "@/components/network-status-banner";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Home from "@/pages/home";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Blog from "@/pages/blog";
import BlogPost from "@/pages/blog-post";
import ForgotPassword from "@/pages/forgot-password";

import ExpiryDocuments from "@/pages/expiry-documents";
import Settings from "@/pages/settings";
import AdminDashboard from "@/pages/admin";
import FeatureFlagsAdmin from "@/pages/admin/feature-flags";
import Pricing from "@/pages/pricing";
import EmailImport from "@/pages/email-import";

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

  return (
    <Switch>
      {!isAuthenticated ? (
        <>
          <Route path="/" component={Landing} />
          <Route path="/login" component={Login} />
          <Route path="/register" component={Register} />
          <Route path="/forgot-password" component={ForgotPassword} />
          <Route path="/pricing" component={Pricing} />
          <Route path="/blog" component={Blog} />
          <Route path="/blog/:slug" component={BlogPost} />
          {/* Redirect protected routes to login */}

          <Route path="/expiry-documents">
            {() => { setLocation("/login"); return null; }}
          </Route>
          <Route path="/settings">
            {() => { setLocation("/login"); return null; }}
          </Route>
          <Route path="/admin">
            {() => { setLocation("/login"); return null; }}
          </Route>
          <Route path="/email-import">
            {() => { setLocation("/login"); return null; }}
          </Route>
        </>
      ) : (
        <>
          <Route path="/" component={Home} />

          <Route path="/expiry-documents" component={ExpiryDocuments} />
          <Route path="/settings" component={Settings} />
          <Route path="/admin" component={AdminDashboard} />
          <Route path="/admin/feature-flags" component={FeatureFlagsAdmin} />
          <Route path="/pricing" component={Pricing} />
          <Route path="/email-import" component={EmailImport} />
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
          <ErrorBoundary>
            <Router />
          </ErrorBoundary>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
