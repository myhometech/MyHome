import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Settings, 
  Flag, 
  Users, 
  BarChart3, 
  Plus, 
  Edit, 
  Trash2, 
  Eye, 
  ToggleLeft, 
  ToggleRight,
  Search,
  Filter,
  Crown,
  Zap,
  Brain,
  Cog,
  Share2,
} from "lucide-react";

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

interface FeatureFlagOverride {
  id: string;
  userId: string;
  userEmail: string;
  featureFlagName: string;
  isEnabled: boolean;
  overrideReason: string;
  expiresAt?: string;
}

const featureFlagFormSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  category: z.enum(['core', 'advanced', 'ai', 'automation', 'collaboration']),
  tierRequired: z.enum(['free', 'premium']),
  rolloutStrategy: z.enum(['tier_based', 'percentage', 'user_list', 'disabled']),
  rolloutPercentage: z.number().min(0).max(100).optional(),
});

const overrideFormSchema = z.object({
  userId: z.string().min(1),
  featureFlagName: z.string().min(1),
  isEnabled: z.boolean(),
  overrideReason: z.enum(['admin_override', 'beta_tester', 'customer_support', 'testing']),
  expiresAt: z.string().optional(),
});

const categoryIcons = {
  core: <Zap className="h-4 w-4" />,
  advanced: <Settings className="h-4 w-4" />,
  ai: <Brain className="h-4 w-4" />,
  automation: <Cog className="h-4 w-4" />,
  collaboration: <Share2 className="h-4 w-4" />,
};

const tierColors = {
  free: "bg-green-100 text-green-800",
  premium: "bg-amber-100 text-amber-800",
};

export default function FeatureFlagsAdmin() {
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [selectedFlag, setSelectedFlag] = useState<FeatureFlag | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isOverrideDialogOpen, setIsOverrideDialogOpen] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch feature flags
  const { data: featureFlags, isLoading: isLoadingFlags } = useQuery<FeatureFlag[]>({
    queryKey: ['/api/admin/feature-flags'],
  });

  // Fetch feature flag overrides
  const { data: overrides, isLoading: isLoadingOverrides } = useQuery<FeatureFlagOverride[]>({
    queryKey: ['/api/admin/feature-flag-overrides'],
  });

  // Fetch analytics
  const { data: analytics } = useQuery({
    queryKey: ['/api/admin/feature-flag-analytics'],
    staleTime: 30000,
  });

  // Create/Update flag mutation
  const flagMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/admin/feature-flags', selectedFlag ? 'PUT' : 'POST', {
      ...data,
      id: selectedFlag?.id,
    }),
    onSuccess: () => {
      toast({
        title: selectedFlag ? "Flag Updated" : "Flag Created",
        description: "Feature flag has been saved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/feature-flags'] });
      setIsCreateDialogOpen(false);
      setSelectedFlag(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save feature flag.",
        variant: "destructive",
      });
    },
  });

  // Toggle flag mutation
  const toggleMutation = useMutation({
    mutationFn: ({ flagId, enabled }: { flagId: string; enabled: boolean }) =>
      apiRequest(`/api/admin/feature-flags/${flagId}/toggle`, 'PATCH', { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/feature-flags'] });
    },
  });

  // Override mutation
  const overrideMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/admin/feature-flag-overrides', 'POST', data),
    onSuccess: () => {
      toast({
        title: "Override Created",
        description: "User override has been set successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/feature-flag-overrides'] });
      setIsOverrideDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create override.",
        variant: "destructive",
      });
    },
  });

  const flagForm = useForm({
    resolver: zodResolver(featureFlagFormSchema),
    defaultValues: {
      name: "",
      description: "",
      category: "core" as const,
      tierRequired: "free" as const,
      rolloutStrategy: "tier_based" as const,
      rolloutPercentage: 100,
    },
  });

  const overrideForm = useForm({
    resolver: zodResolver(overrideFormSchema),
    defaultValues: {
      userId: "",
      featureFlagName: "",
      isEnabled: true,
      overrideReason: "admin_override" as const,
      expiresAt: "",
    },
  });

  // Filter flags
  const filteredFlags = (featureFlags as FeatureFlag[] || []).filter((flag) => {
    const matchesSearch = flag.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         flag.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === "all" || flag.category === categoryFilter;
    const matchesTier = tierFilter === "all" || flag.tierRequired === tierFilter;
    return matchesSearch && matchesCategory && matchesTier;
  });

  const openEditDialog = (flag: FeatureFlag) => {
    setSelectedFlag(flag);
    flagForm.reset({
      name: flag.name,
      description: flag.description,
      category: flag.category,
      tierRequired: flag.tierRequired,
      rolloutStrategy: flag.rolloutStrategy,
      rolloutPercentage: flag.rolloutPercentage || 100,
    });
    setIsCreateDialogOpen(true);
  };

  const openCreateDialog = () => {
    setSelectedFlag(null);
    flagForm.reset();
    setIsCreateDialogOpen(true);
  };

  if (isLoadingFlags) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-48 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Feature Flags</h1>
          <p className="text-gray-600">Manage feature rollouts and user access</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Create Flag
        </Button>
      </div>

      <Tabs defaultValue="flags" className="space-y-6">
        <TabsList>
          <TabsTrigger value="flags" className="flex items-center gap-2">
            <Flag className="h-4 w-4" />
            Feature Flags
          </TabsTrigger>
          <TabsTrigger value="overrides" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            User Overrides
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="flags" className="space-y-6">
          {/* Search and Filter */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search flags..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="Filter by category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="core">Core</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                    <SelectItem value="ai">AI</SelectItem>
                    <SelectItem value="automation">Automation</SelectItem>
                    <SelectItem value="collaboration">Collaboration</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={tierFilter} onValueChange={setTierFilter}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="Filter by tier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tiers</SelectItem>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Feature Flags Grid */}
          <div data-testid="feature-flags-table" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredFlags.map((flag) => (
              <Card key={flag.id} className="relative">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      {categoryIcons[flag.category]}
                      <CardTitle className="text-lg">{flag.name}</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={tierColors[flag.tierRequired]}>
                        {flag.tierRequired === 'premium' && <Crown className="h-3 w-3 mr-1" />}
                        {flag.tierRequired}
                      </Badge>
                      <Switch
                        checked={flag.enabled}
                        onCheckedChange={(enabled) =>
                          toggleMutation.mutate({ flagId: flag.id, enabled })
                        }
                      />
                    </div>
                  </div>
                  <CardDescription className="text-sm">
                    {flag.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Strategy:</span>
                      <Badge variant="outline">{flag.rolloutStrategy.replace('_', ' ')}</Badge>
                    </div>
                    {flag.rolloutStrategy === 'percentage' && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Rollout:</span>
                        <span className="font-medium">{flag.rolloutPercentage}%</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Category:</span>
                      <Badge variant="secondary">{flag.category}</Badge>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEditDialog(flag)}
                        className="flex-1"
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="overrides" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-semibold">User Overrides</h2>
              <p className="text-gray-600">Manage per-user feature access</p>
            </div>
            <Button onClick={() => setIsOverrideDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Override
            </Button>
          </div>

          {/* Overrides List */}
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {(overrides as FeatureFlagOverride[] || []).map((override) => (
                  <div key={override.id} className="p-4 flex items-center justify-between">
                    <div>
                      <div className="font-medium">{override.userEmail}</div>
                      <div className="text-sm text-gray-600">
                        {override.featureFlagName} • {override.overrideReason}
                      </div>
                      {override.expiresAt && (
                        <div className="text-xs text-gray-500">
                          Expires: {new Date(override.expiresAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={override.isEnabled ? "default" : "secondary"}>
                        {override.isEnabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold">Feature Analytics</h2>
            <p className="text-gray-600">Track feature usage and adoption</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Total Flags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{(featureFlags || []).length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Active Flags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(featureFlags || []).filter(f => f.enabled).length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">User Overrides</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{(overrides || []).length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Premium Features</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(featureFlags || []).filter(f => f.tierRequired === 'premium').length}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Create/Edit Flag Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedFlag ? 'Edit' : 'Create'} Feature Flag</DialogTitle>
            <DialogDescription>
              Configure feature flag settings and rollout strategy.
            </DialogDescription>
          </DialogHeader>
          <Form {...flagForm}>
            <form onSubmit={flagForm.handleSubmit((data) => flagMutation.mutate(data))} className="space-y-4">
              <FormField
                control={flagForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="FEATURE_NAME" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={flagForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Describe what this feature does..." />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={flagForm.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="core">Core</SelectItem>
                          <SelectItem value="advanced">Advanced</SelectItem>
                          <SelectItem value="ai">AI</SelectItem>
                          <SelectItem value="automation">Automation</SelectItem>
                          <SelectItem value="collaboration">Collaboration</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={flagForm.control}
                  name="tierRequired"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tier Required</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="free">Free</SelectItem>
                          <SelectItem value="premium">Premium</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={flagForm.control}
                name="rolloutStrategy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rollout Strategy</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="tier_based">Tier Based</SelectItem>
                        <SelectItem value="percentage">Percentage Rollout</SelectItem>
                        <SelectItem value="user_list">User List</SelectItem>
                        <SelectItem value="disabled">Disabled</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {flagForm.watch('rolloutStrategy') === 'percentage' && (
                <FormField
                  control={flagForm.control}
                  name="rolloutPercentage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rollout Percentage</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value))}
                        />
                      </FormControl>
                      <FormDescription>
                        Percentage of users who will have access to this feature
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <div className="flex gap-2 pt-2">
                <Button type="submit" disabled={flagMutation.isPending} className="flex-1">
                  {flagMutation.isPending ? "Saving..." : (selectedFlag ? "Update" : "Create")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* User Override Dialog */}
      <Dialog open={isOverrideDialogOpen} onOpenChange={setIsOverrideDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add User Override</DialogTitle>
            <DialogDescription>
              Override feature access for a specific user.
            </DialogDescription>
          </DialogHeader>
          <Form {...overrideForm}>
            <form onSubmit={overrideForm.handleSubmit((data) => overrideMutation.mutate(data))} className="space-y-4">
              <FormField
                control={overrideForm.control}
                name="userId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>User ID</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Enter user ID..." />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={overrideForm.control}
                name="featureFlagName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Feature Flag</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select feature flag..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(featureFlags as FeatureFlag[] || []).map((flag) => (
                          <SelectItem key={flag.id} value={flag.name}>
                            {flag.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={overrideForm.control}
                  name="isEnabled"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-2 space-y-0">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel>Enable Feature</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={overrideForm.control}
                  name="overrideReason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reason</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="admin_override">Admin Override</SelectItem>
                          <SelectItem value="beta_tester">Beta Tester</SelectItem>
                          <SelectItem value="customer_support">Customer Support</SelectItem>
                          <SelectItem value="testing">Testing</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={overrideForm.control}
                name="expiresAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expires At (Optional)</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormDescription>
                      Leave empty for permanent override
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex gap-2 pt-2">
                <Button type="submit" disabled={overrideMutation.isPending} className="flex-1">
                  {overrideMutation.isPending ? "Creating..." : "Create Override"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsOverrideDialogOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}