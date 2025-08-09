import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Cloud, HardDrive, Zap, DollarSign, TrendingUp, TrendingDown, Brain, Database } from "lucide-react";

interface GCSUsage {
  totalStorageGB: number;
  totalStorageTB: number;
  costThisMonth: number;
  requestsThisMonth: number;
  bandwidthGB: number;
  trend: 'up' | 'down' | 'stable';
  trendPercentage: number;
}

interface OpenAIUsage {
  totalTokens: number;
  costThisMonth: number;
  requestsThisMonth: number;
  modelBreakdown: Array<{
    model: string;
    tokens: number;
    cost: number;
    requests: number;
  }>;
  trend: 'up' | 'down' | 'stable';
  trendPercentage: number;
  successRate: number;
}

export function CloudUsageCards() {
  const { data: gcsUsage, isLoading: gcsLoading, error: gcsError } = useQuery<GCSUsage>({
    queryKey: ['/api/admin/cloud-usage'],
    queryFn: async () => {
      console.log('🔄 Fetching GCS usage data...');
      const response = await fetch('/api/admin/cloud-usage', {
        credentials: 'include',
      });
      if (!response.ok) {
        console.error('❌ GCS usage fetch failed:', response.status, response.statusText);
        throw new Error(`Failed to fetch GCS usage: ${response.status}`);
      }
      const data = await response.json();
      console.log('✅ GCS usage data received:', data);
      return data;
    },
    retry: 3,
    retryDelay: 1000,
  });

  const { data: openaiUsage, isLoading: openaiLoading, error: openaiError } = useQuery<OpenAIUsage>({
    queryKey: ['/api/admin/llm-usage/analytics'],
    queryFn: async () => {
      console.log('🔄 Fetching OpenAI usage data...');
      const response = await fetch('/api/admin/llm-usage/analytics', {
        credentials: 'include',
      });
      if (!response.ok) {
        console.error('❌ OpenAI usage fetch failed:', response.status, response.statusText);
        throw new Error(`Failed to fetch OpenAI usage: ${response.status}`);
      }
      const data = await response.json();
      console.log('✅ OpenAI usage data received:', data);
      return data;
    },
    retry: 3,
    retryDelay: 1000,
  });

  const getTrendIcon = (trend: string, percentage: number) => {
    if (trend === 'up') return <TrendingUp className="h-4 w-4 text-red-500" />;
    if (trend === 'down') return <TrendingDown className="h-4 w-4 text-green-500" />;
    return null;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatTokens = (tokens: number) => {
    if (tokens > 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`;
    }
    if (tokens > 1000) {
      return `${(tokens / 1000).toFixed(1)}K`;
    }
    return tokens.toString();
  };

  if (gcsLoading || openaiLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="space-y-0 pb-2">
              <div className="h-4 bg-gray-200 rounded w-24"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-gray-200 rounded w-16 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-20"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (gcsError || openaiError) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-red-700">
            <span>Failed to load cloud usage data</span>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* GCS Usage Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {gcsUsage?.totalStorageGB?.toFixed(2) || '0'} GB
            </div>
            <div className="flex items-center space-x-2 text-xs text-muted-foreground">
              {gcsUsage && getTrendIcon(gcsUsage.trend, gcsUsage.trendPercentage)}
              <span>{gcsUsage?.trendPercentage || 0}% vs last month</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Storage Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(gcsUsage?.costThisMonth || 0)}
            </div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Requests</CardTitle>
            <Cloud className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {gcsUsage?.requestsThisMonth?.toLocaleString() || '0'}
            </div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bandwidth</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {gcsUsage?.bandwidthGB?.toFixed(1) || '0'} GB
            </div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>
      </div>

      {/* OpenAI Usage Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">AI Tokens</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatTokens(openaiUsage?.totalTokens || 0)}
            </div>
            <div className="flex items-center space-x-2 text-xs text-muted-foreground">
              {openaiUsage && getTrendIcon(openaiUsage.trend, openaiUsage.trendPercentage)}
              <span>{openaiUsage?.trendPercentage || 0}% vs last month</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">AI Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(openaiUsage?.costThisMonth || 0)}
            </div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">AI Requests</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {openaiUsage?.requestsThisMonth?.toLocaleString() || '0'}
            </div>
            <p className="text-xs text-muted-foreground">This month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {openaiUsage?.successRate?.toFixed(1) || '0'}%
            </div>
            <Progress value={openaiUsage?.successRate || 0} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Model Breakdown */}
      {openaiUsage?.modelBreakdown && openaiUsage.modelBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>AI Model Usage</CardTitle>
            <CardDescription>Usage breakdown by AI model</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {openaiUsage.modelBreakdown.map((model, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="font-medium">{model.model}</div>
                    <div className="text-sm text-muted-foreground">
                      {formatTokens(model.tokens)} tokens • {model.requests} requests
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{formatCurrency(model.cost)}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}