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
  const { data: gcsUsage, isLoading: gcsLoading } = useQuery<GCSUsage>({
    queryKey: ['/api/admin/cloud-usage'],
    queryFn: async () => {
      const response = await fetch('/api/admin/cloud-usage', {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch GCS usage: ${response.status}`);
      }
      return response.json();
    },
  });

  const { data: openaiUsage, isLoading: openaiLoading } = useQuery<OpenAIUsage>({
    queryKey: ['/api/admin/llm-usage/analytics'],
    queryFn: async () => {
      const response = await fetch('/api/admin/llm-usage/analytics', {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch OpenAI usage: ${response.status}`);
      }
      return response.json();
    },
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
    return <div className="text-center py-4">Loading cloud usage data...</div>;
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