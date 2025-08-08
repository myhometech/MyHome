import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, FileText, HardDrive, Activity, Flag, BarChart3, Cloud, Brain, AlertCircle } from "lucide-react";
import { isUnauthorizedError } from "@/lib/authUtils";
import { UsersTable } from "@/components/admin/UsersTable";
import { ActivityLog } from "@/components/admin/ActivityLog";
import { FeatureFlagsPanel } from "@/components/admin/FeatureFlagsPanel";
import { SearchAnalytics } from "@/components/admin/SearchAnalytics";
import { CloudUsageCards } from "@/components/admin/CloudUsageCards";

interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalDocuments: number;
  totalStorageBytes: number;
  uploadsThisMonth: number;
  newUsersThisMonth: number;
}

interface UserWithRole {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  isActive: boolean;
}

export default function AdminDashboard() {
  const { toast } = useToast();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const userWithRole = user as UserWithRole;

  // Admin access check
  useEffect(() => {
    if (!authLoading && (!isAuthenticated || userWithRole?.role !== 'admin')) {
      toast({
        title: "Access Denied",
        description: "You need admin privileges to access this page.",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/";
      }, 2000);
    }
  }, [userWithRole, authLoading, isAuthenticated, toast]);

  const { data: adminStats, isLoading: statsLoading, error: statsError } = useQuery<AdminStats>({
    queryKey: ['/api/admin/stats'],
    enabled: isAuthenticated && userWithRole?.role === 'admin',
    queryFn: async () => {
      console.log('🔄 Fetching admin stats...');
      const response = await fetch('/api/admin/stats', { credentials: 'include' });
      if (!response.ok) {
        console.error('❌ Admin stats fetch failed:', response.status, response.statusText);
        throw new Error(`Failed to fetch admin stats: ${response.status}`);
      }
      const data = await response.json();
      console.log('✅ Admin stats received:', data);
      return data;
    },
    retry: 3,
    retryDelay: 1000,
  });

  // Handle authentication errors
  useEffect(() => {
    if (statsError && isUnauthorizedError(statsError)) {
      toast({
        title: "Session Expired",
        description: "Please log in again to access admin features.",
        variant: "destructive",
      });
    }
  }, [statsError, toast]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  // Debug info for troubleshooting
  if (statsError) {
    console.error('❌ Admin stats error:', statsError);
  }

  if (statsLoading) {
    console.log('🔄 Admin stats loading...');
  }

  if (adminStats) {
    console.log('📊 Admin stats loaded:', adminStats);
  }

  if (!isAuthenticated || userWithRole?.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-destructive">Access Denied</div>
      </div>
    );
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <div className="text-sm text-muted-foreground">
          Welcome, {userWithRole?.email}
        </div>
      </div>

      {/* Error State */}
      {statsError && (
        <Card className="border-red-200 bg-red-50 mb-6">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="h-5 w-5" />
              <div>
                <p className="font-medium">Failed to load admin statistics</p>
                <p className="text-sm opacity-75">
                  {statsError instanceof Error ? statsError.message : 'Unknown error occurred'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? "..." : statsError ? "Error" : adminStats?.totalUsers || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {statsLoading ? "..." : statsError ? "Failed to load" : `${adminStats?.activeUsers || 0} active`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? "..." : statsError ? "Error" : adminStats?.totalDocuments || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {statsLoading ? "..." : statsError ? "Failed to load" : `${adminStats?.uploadsThisMonth || 0} this month`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? "..." : statsError ? "Error" : formatBytes(adminStats?.totalStorageBytes || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {statsError ? "Failed to load" : "Cloud storage"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New Users</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? "..." : statsError ? "Error" : adminStats?.newUsersThisMonth || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {statsError ? "Failed to load" : "This month"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabbed Content */}
      <Tabs defaultValue="users" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Activity
          </TabsTrigger>
          <TabsTrigger value="flags" className="flex items-center gap-2">
            <Flag className="h-4 w-4" />
            Feature Flags
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Search Analytics
          </TabsTrigger>
          <TabsTrigger value="usage" className="flex items-center gap-2">
            <Cloud className="h-4 w-4" />
            Cloud Usage
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Management</CardTitle>
              <CardDescription>
                Manage user accounts, roles, and status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UsersTable />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Activity</CardTitle>
              <CardDescription>
                Monitor user actions and system events
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActivityLog />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="flags" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Feature Flags</CardTitle>
              <CardDescription>
                Control feature rollouts and user access
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FeatureFlagsPanel />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Search Analytics</CardTitle>
              <CardDescription>
                Monitor search performance and user behavior
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SearchAnalytics />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage" className="space-y-4">
          <CloudUsageCards />
        </TabsContent>
      </Tabs>
    </div>
  );
}