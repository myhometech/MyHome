import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Flag, Crown, Zap, Brain, Cog, Share2, ToggleLeft, ToggleRight, BarChart3 } from "lucide-react";

interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  category: 'core' | 'advanced' | 'ai' | 'automation' | 'collaboration';
  tierRequired: 'free' | 'premium';
  enabled: boolean;
  rolloutStrategy: 'tier_based' | 'percentage' | 'user_list' | 'disabled';
  rolloutPercentage?: number;
  createdAt: string;
  updatedAt: string;
}

interface FeatureFlagAnalytics {
  totalFlags: string;
  activeFlags: string;
  premiumFlags: string;
  averageRollout: string;
}

export function FeatureFlagsPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: flags, isLoading: flagsLoading } = useQuery<FeatureFlag[]>({
    queryKey: ['/api/admin/feature-flags'],
    queryFn: async () => {
      const response = await fetch('/api/admin/feature-flags', {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch feature flags: ${response.status}`);
      }
      return response.json();
    },
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery<FeatureFlagAnalytics>({
    queryKey: ['/api/admin/feature-flag-analytics'],
    queryFn: async () => {
      const response = await fetch('/api/admin/feature-flag-analytics', {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch feature flag analytics: ${response.status}`);
      }
      return response.json();
    },
  });

  const toggleFlagMutation = useMutation({
    mutationFn: async ({ flagId, enabled }: { flagId: string; enabled: boolean }) => {
      return apiRequest(`/api/admin/feature-flags/${flagId}/toggle`, {
        method: 'PATCH',
        body: { enabled }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/feature-flags'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/feature-flag-analytics'] });
      toast({
        title: "Feature Flag Updated",
        description: "Feature flag status has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update feature flag.",
        variant: "destructive",
      });
    },
  });

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'core':
        return <Cog className="h-4 w-4 text-blue-500" />;
      case 'advanced':
        return <Zap className="h-4 w-4 text-purple-500" />;
      case 'ai':
        return <Brain className="h-4 w-4 text-green-500" />;
      case 'automation':
        return <BarChart3 className="h-4 w-4 text-orange-500" />;
      case 'collaboration':
        return <Share2 className="h-4 w-4 text-pink-500" />;
      default:
        return <Flag className="h-4 w-4 text-gray-500" />;
    }
  };

  const getTierIcon = (tier: string) => {
    return tier === 'premium' ? <Crown className="h-4 w-4 text-yellow-500" /> : null;
  };

  if (flagsLoading || analyticsLoading) {
    return <div className="text-center py-4">Loading feature flags...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Flags</CardTitle>
            <Flag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.totalFlags || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Flags</CardTitle>
            <ToggleRight className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.activeFlags || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Premium Flags</CardTitle>
            <Crown className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.premiumFlags || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Rollout</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.averageRollout || '0'}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Feature Flags Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Flag</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Strategy</TableHead>
              <TableHead>Rollout</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {flags?.map((flag) => (
              <TableRow key={flag.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <Flag className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{flag.name}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {flag.description}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {getCategoryIcon(flag.category)}
                    <Badge variant="outline">{flag.category}</Badge>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {getTierIcon(flag.tierRequired)}
                    <Badge variant={flag.tierRequired === 'premium' ? 'default' : 'secondary'}>
                      {flag.tierRequired}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {flag.rolloutStrategy.replace('_', ' ')}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="font-mono">
                    {flag.rolloutPercentage ? `${flag.rolloutPercentage}%` : 'N/A'}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={flag.enabled ? 'default' : 'destructive'}>
                    {flag.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={flag.enabled}
                      onCheckedChange={(checked) => 
                        toggleFlagMutation.mutate({ flagId: flag.id, enabled: checked })
                      }
                      disabled={toggleFlagMutation.isPending}
                    />
                    {flag.enabled ? (
                      <ToggleRight className="h-4 w-4 text-green-500" />
                    ) : (
                      <ToggleLeft className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {flags && (
        <div className="text-sm text-muted-foreground">
          Total: {flags.length} feature flags
        </div>
      )}
    </div>
  );
}