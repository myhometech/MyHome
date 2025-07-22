import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Home from "@/pages/home";
import Login from "@/pages/login";
import Register from "@/pages/register";
import ForgotPassword from "@/pages/forgot-password";
import SharedWithMe from "@/pages/shared-with-me";
import ExpiryDocuments from "@/pages/expiry-documents";
import Settings from "@/pages/settings";
import AdminDashboard from "@/pages/admin";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

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
          {/* Redirect protected routes to login */}
          <Route path="/shared-with-me">
            {() => { window.location.href = "/login"; return null; }}
          </Route>
          <Route path="/expiry-documents">
            {() => { window.location.href = "/login"; return null; }}
          </Route>
          <Route path="/settings">
            {() => { window.location.href = "/login"; return null; }}
          </Route>
        </>
      ) : (
        <>
          <Route path="/" component={Home} />
          <Route path="/shared-with-me" component={SharedWithMe} />
          <Route path="/expiry-documents" component={ExpiryDocuments} />
          <Route path="/settings" component={Settings} />
          <Route path="/admin" component={AdminDashboard} />
          {/* Redirect auth routes to home for logged in users */}
          <Route path="/login">
            {() => { window.location.href = "/"; return null; }}
          </Route>
          <Route path="/register">
            {() => { window.location.href = "/"; return null; }}
          </Route>
          <Route path="/forgot-password">
            {() => { window.location.href = "/"; return null; }}
          </Route>
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
