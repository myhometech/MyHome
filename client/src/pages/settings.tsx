import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/header";


import SubscriptionPlans from "@/components/SubscriptionPlans";
import CategoryManagement from "@/components/category-management";
import { YourAssetsSection } from "@/components/YourAssetsSection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Settings as SettingsIcon, User, Bell, Shield, HelpCircle, CreditCard, Car, Plus, Calendar, FileText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFeatures } from "@/hooks/useFeatures";
import { Crown } from "lucide-react";

// Vehicle interface based on the API structure
interface Vehicle {
  id: string;
  vrn: string;
  make?: string;
  model?: string;
  yearOfManufacture?: number;
  taxStatus?: string;
  taxDueDate?: string;
  motStatus?: string;
  motExpiryDate?: string;
  source: 'dvla' | 'manual';
  notes?: string;
}

// Helper function to get status color and text
const getStatusDisplay = (status?: string, dueDate?: string) => {
  if (!status && !dueDate) {
    return { color: 'text-gray-500', text: 'Unknown' };
  }
  
  if (dueDate) {
    const due = new Date(dueDate);
    const now = new Date();
    const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilDue < 0) {
      return { color: 'text-red-600', text: 'Overdue' };
    } else if (daysUntilDue <= 7) {
      return { color: 'text-orange-600', text: 'Due Soon' };
    } else if (daysUntilDue <= 30) {
      return { color: 'text-yellow-600', text: 'Due This Month' };
    } else {
      return { color: 'text-green-600', text: `Due ${due.toLocaleDateString()}` };
    }
  }
  
  // Fallback to status text
  if (status === 'Taxed') return { color: 'text-green-600', text: 'Taxed' };
  if (status === 'Valid') return { color: 'text-green-600', text: 'Valid' };
  if (status === 'Not Taxed') return { color: 'text-red-600', text: 'Not Taxed' };
  if (status === 'Expired') return { color: 'text-red-600', text: 'Expired' };
  
  return { color: 'text-gray-500', text: status || 'Unknown' };
};

// Vehicle Card Component
function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  const taxDisplay = getStatusDisplay(vehicle.taxStatus, vehicle.taxDueDate);
  const motDisplay = getStatusDisplay(vehicle.motStatus, vehicle.motExpiryDate);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <Car className="h-8 w-8 text-blue-600" />
            <div>
              <h3 className="font-semibold text-lg">{vehicle.vrn}</h3>
              {vehicle.make && (
                <p className="text-gray-600">
                  {vehicle.make} {vehicle.model} {vehicle.yearOfManufacture && `(${vehicle.yearOfManufacture})`}
                </p>
              )}
            </div>
          </div>
          {vehicle.source === 'dvla' && (
            <Badge variant="secondary" className="text-xs">
              DVLA Verified
            </Badge>
          )}
        </div>
        
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium">Tax Status</span>
            </div>
            <p className={`text-sm ${taxDisplay.color}`}>{taxDisplay.text}</p>
          </div>
          
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium">MOT Status</span>
            </div>
            <p className={`text-sm ${motDisplay.color}`}>{motDisplay.text}</p>
          </div>
        </div>
        
        {vehicle.notes && (
          <div className="mb-4">
            <p className="text-sm text-gray-600">{vehicle.notes}</p>
          </div>
        )}
        
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1">
            View Details
          </Button>
          <Button variant="outline" size="sm">
            Edit
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Assets Tab Content Component
function AssetsTabContent() {
  const { user, isAuthenticated } = useAuth();
  
  // Fetch vehicles data
  const { data: vehicles, isLoading, error } = useQuery<Vehicle[]>({
    queryKey: ['/api/vehicles'],
    enabled: isAuthenticated,
  });

  const handleAddVehicle = () => {
    // Navigate to add vehicle - could be a modal or separate page
    // For now, just placeholder functionality
    console.log('Add vehicle clicked');
    // TODO: Implement add vehicle modal or navigation
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Car className="h-5 w-5" />
              Vehicle Assets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Car className="h-5 w-5" />
              Vehicle Assets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <p className="text-red-600">Failed to load vehicles. Please try again.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Car className="h-5 w-5" />
              Vehicle Assets
            </CardTitle>
            <Button onClick={handleAddVehicle} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Vehicle
            </Button>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            Manage your vehicles, track MOT and tax expiry dates, and get AI-powered compliance insights.
          </p>
        </CardHeader>
        <CardContent>
          {!vehicles || vehicles.length === 0 ? (
            <div className="text-center py-12">
              <Car className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No vehicles added yet</h3>
              <p className="text-gray-600 mb-6">
                Add your first vehicle to track tax, MOT, and get compliance reminders.
              </p>
              <Button onClick={handleAddVehicle} className="flex items-center gap-2 mx-auto">
                <Plus className="h-4 w-4" />
                Add Your First Vehicle
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {vehicles.map((vehicle) => (
                <VehicleCard key={vehicle.id} vehicle={vehicle} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Settings() {
  const { user, isAuthenticated, isLoading } = useAuth();
  // Get subscription status for proper premium detection
  const { data: subscriptionStatus } = useQuery<{
    tier: string;
    status: string;
    renewalDate?: string;
  }>({
    queryKey: ["/api/stripe/subscription-status"],
    enabled: isAuthenticated,
  });
  
  const isPremium = subscriptionStatus?.tier === 'premium' && subscriptionStatus?.status === 'active';
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");



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

        {/* Settings Tabs */}
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="assets" className="flex items-center gap-2">
              <Car className="h-4 w-4" />
              Assets
            </TabsTrigger>
            <TabsTrigger value="billing" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Billing
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Notifications
            </TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Security
            </TabsTrigger>
            <TabsTrigger value="support" className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4" />
              Support
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-6">
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
                      {isPremium ? (
                        <Badge className="bg-gradient-to-r from-amber-400 to-orange-500 text-white">
                          <Crown className="h-3 w-3 mr-1" />
                          Premium Plan
                        </Badge>
                      ) : (
                        <Badge variant="outline">Free Plan</Badge>
                      )}
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
            </CardContent>
          </Card>

            {/* Category Management Section */}
            <CategoryManagement />

            {/* Your Assets Section */}
            <YourAssetsSection />


          </TabsContent>

          {/* Assets Tab */}
          <TabsContent value="assets" className="space-y-6">
            <AssetsTabContent />
          </TabsContent>

          {/* Billing Tab */}
          <TabsContent value="billing" className="space-y-6">
            {isPremium && (
              <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-800 dark:text-green-200">
                    <Crown className="h-5 w-5" />
                    Premium Active
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-green-700 dark:text-green-300">
                  You have full access to all premium features including unlimited documents and AI analysis.
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Subscription & Billing
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SubscriptionPlans />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Notification Preferences
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
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-6">
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
          </TabsContent>

          {/* Support Tab */}
          <TabsContent value="support" className="space-y-6">
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
                    <p className="text-sm text-gray-600">Learn how to use MyHome effectively</p>
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
          </TabsContent>
        </Tabs>
      </main>

    </div>
  );
}