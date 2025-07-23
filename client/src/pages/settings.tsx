import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/header";
import MobileNav from "@/components/mobile-nav";
import { EmailForwarding } from "@/components/email-forwarding";
import SubscriptionPlans from "@/components/SubscriptionPlans";
import CategoryManagement from "@/components/category-management";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Settings as SettingsIcon, User, Mail, Bell, Shield, HelpCircle, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

export default function Settings() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");

  // Get user's forwarding email address
  const { data: forwardingInfo, isLoading: forwardingLoading } = useQuery<{
    address: string;
    instructions: string;
  }>({
    queryKey: ["/api/email/forwarding-address"],
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  const getInitials = (firstName?: string, lastName?: string) => {
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase();
    }
    if (firstName) return firstName[0].toUpperCase();
    if ((user as any)?.email) return (user as any).email[0].toUpperCase();
    return "U";
  };

  const getDisplayName = () => {
    if ((user as any)?.firstName && (user as any)?.lastName) {
      return `${(user as any).firstName} ${(user as any).lastName}`;
    }
    if ((user as any)?.firstName) return (user as any).firstName;
    return (user as any)?.email || "User";
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied!",
        description: "Email address copied to clipboard",
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Could not copy to clipboard",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-20 md:pb-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <SettingsIcon className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          </div>
          <p className="text-gray-600">Manage your account and preferences</p>
        </div>

        <div className="space-y-6">
          {/* Profile Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Profile Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={(user as any)?.profileImageUrl} alt="Profile" />
                  <AvatarFallback className="text-lg">
                    {getInitials((user as any)?.firstName, (user as any)?.lastName)}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex-1 space-y-2">
                  <div>
                    <h3 className="text-lg font-semibold">{getDisplayName()}</h3>
                    <p className="text-gray-600">{(user as any)?.email}</p>
                  </div>
                  
                  <div className="flex gap-2">
                    <Badge variant="secondary">Verified Account</Badge>
                    <Badge variant="outline">Free Plan</Badge>
                  </div>
                  
                  <p className="text-sm text-gray-500">
                    Member since {(user as any)?.createdAt ? new Date((user as any).createdAt).toLocaleDateString('en-US', { 
                      month: 'long', 
                      year: 'numeric' 
                    }) : 'Recently'}
                  </p>
                </div>
                
                <Button variant="outline" size="sm">
                  Edit Profile
                </Button>
              </div>

              {/* Document Import Email Address */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">📧 Your Document Import Email</h4>
                    <p className="text-sm text-gray-600 mb-3">
                      Forward emails with documents to this unique address to automatically import them
                    </p>
                    
                    {forwardingLoading ? (
                      <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        <span className="text-sm text-gray-600">Loading your email address...</span>
                      </div>
                    ) : forwardingInfo?.address ? (
                      <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <code className="flex-1 text-sm font-mono text-blue-800 bg-white px-2 py-1 rounded border">
                          {forwardingInfo.address}
                        </code>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyToClipboard(forwardingInfo.address)}
                          className="shrink-0"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 p-3 bg-orange-50 rounded-lg border border-orange-200">
                        <span className="text-sm text-orange-800">Unable to load forwarding address</span>
                      </div>
                    )}
                    
                    <div className="mt-2 flex gap-2">
                      <Button 
                        variant="link" 
                        size="sm" 
                        className="h-auto p-0 text-xs text-blue-600"
                        onClick={() => {
                          const emailSection = document.getElementById('email-forwarding-section');
                          emailSection?.scrollIntoView({ behavior: 'smooth' });
                        }}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        View Instructions & Test
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Category Management Section */}
          <CategoryManagement />

          {/* Email Forwarding Section */}
          <div id="email-forwarding-section">
            <EmailForwarding />
          </div>

          {/* Notifications Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notifications
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Document Expiry Alerts</h4>
                  <p className="text-sm text-gray-600">Get notified when documents are expiring</p>
                </div>
                <Button variant="outline" size="sm">
                  Configure
                </Button>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Email Processing Updates</h4>
                  <p className="text-sm text-gray-600">Notifications when emails are processed</p>
                </div>
                <Button variant="outline" size="sm">
                  Configure
                </Button>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Sharing Notifications</h4>
                  <p className="text-sm text-gray-600">When documents are shared with you</p>
                </div>
                <Button variant="outline" size="sm">
                  Configure
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Security Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Security & Privacy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Account Security</h4>
                  <p className="text-sm text-gray-600">Manage your sign-in methods and security</p>
                </div>
                <Button variant="outline" size="sm">
                  Manage
                </Button>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Data Export</h4>
                  <p className="text-sm text-gray-600">Download all your documents and data</p>
                </div>
                <Button variant="outline" size="sm">
                  Export
                </Button>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Delete Account</h4>
                  <p className="text-sm text-gray-600">Permanently delete your account and data</p>
                </div>
                <Button variant="destructive" size="sm">
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Help & Support Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5" />
                Help & Support
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Documentation</h4>
                  <p className="text-sm text-gray-600">Learn how to use HomeDocs effectively</p>
                </div>
                <Button variant="outline" size="sm">
                  View Docs
                </Button>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Contact Support</h4>
                  <p className="text-sm text-gray-600">Get help with any issues or questions</p>
                </div>
                <Button variant="outline" size="sm">
                  Contact Us
                </Button>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Feature Requests</h4>
                  <p className="text-sm text-gray-600">Suggest improvements or new features</p>
                </div>
                <Button variant="outline" size="sm">
                  Submit Idea
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <MobileNav />
    </div>
  );
}