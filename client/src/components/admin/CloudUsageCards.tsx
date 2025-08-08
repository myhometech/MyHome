import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Cloud, Brain, HardDrive, DollarSign, TrendingUp, Database } from "lucide-react";

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
}

export function CloudUsageCards() {
  const { data: gcsUsage, isLoading: gcsLoading } = useQuery<GCSUsage>({
    queryKey: ['/api/admin/usage/gcs'],
  });

  const { data: llmUsage, isLoading: llmLoading } = useQuery({
    queryKey: ['/api/admin/llm-usage/analytics'],
    queryFn: async () => {
      const response = await fetch('/api/admin/llm-usage/analytics?timeRange=30d');
      if (!response.ok) {
        throw new Error('Failed to fetch LLM analytics');
      }
      return response.json();
    },
    refetchInterval: 60000, // Refresh every minute
  });

  const formatCurrency = (amount: number | undefined) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount || 0);
  };

  const formatNumber = (num: number | undefined) => {
    if (!num || isNaN(num)) return "0";
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'down':
        return <TrendingUp className="h-4 w-4 text-red-500 rotate-180" />;
      default:
        return <TrendingUp className="h-4 w-4 text-gray-500" />;
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'up':
        return 'text-green-500';
      case 'down':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  if (gcsLoading || llmLoading) {
    return <div className="text-center py-4">Loading cloud usage data...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Google Cloud Storage Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Cloud className="h-5 w-5 text-blue-500" />
          <h3 className="text-lg font-semibold">Google Cloud Storage</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Storage</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {gcsUsage ?
                  (gcsUsage.totalStorageTB > 1 ?
                    `${gcsUsage.totalStorageTB.toFixed(2)} TB` :
                    `${gcsUsage.totalStorageGB.toFixed(1)} GB`
                  ) :
                  "0 GB"
                }
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {gcsUsage && getTrendIcon(gcsUsage.trend)}
                <span className={getTrendColor(gcsUsage?.trend || 'stable')}>
                  {gcsUsage?.trendPercentage ? `${gcsUsage.trendPercentage}%` : '0%'}
                </span>
                this month
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
                {gcsUsage ? formatCurrency(gcsUsage.costThisMonth) : "$0.00"}
              </div>
              <p className="text-xs text-muted-foreground">
                This month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">API Requests</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {gcsUsage ? formatNumber(gcsUsage.requestsThisMonth) : "0"}
              </div>
              <p className="text-xs text-muted-foreground">
                This month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bandwidth</CardTitle>
              <HardDrive className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {gcsUsage ? `${gcsUsage.bandwidthGB.toFixed(1)} GB` : "0 GB"}
              </div>
              <p className="text-xs text-muted-foreground">
                This month
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* LLM Usage Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-green-500" />
          <h3 className="text-lg font-semibold">Mistral LLM Usage</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
              <Brain className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {llmUsage ? formatNumber(llmUsage.totalTokens) : "0"}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="text-green-500">
                  {llmUsage?.successRate ? `${llmUsage.successRate.toFixed(1)}%` : '0%'} success
                </span>
                last 30 days
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
                {llmUsage ? formatCurrency(llmUsage.totalCost) : "$0.00"}
              </div>
              <p className="text-xs text-muted-foreground">
                This month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">API Requests</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {llmUsage ? formatNumber(llmUsage.totalRequests) : "0"}
              </div>
              <p className="text-xs text-muted-foreground">
                This month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Top Provider</CardTitle>
              <Badge variant="outline" className="text-xs">
                {llmUsage?.byProvider && Object.keys(llmUsage.byProvider).length > 0 ? Object.keys(llmUsage.byProvider)[0] : "N/A"}
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {llmUsage?.byProvider && Object.keys(llmUsage.byProvider).length > 0 ?
                  formatCurrency((Object.values(llmUsage.byProvider)[0] as any)?.cost) :
                  "$0.00"
                }
              </div>
              <p className="text-xs text-muted-foreground">
                {llmUsage?.byProvider && Object.keys(llmUsage.byProvider).length > 0 ?
                  `${formatNumber((Object.values(llmUsage.byProvider)[0] as any)?.requests)} requests` :
                  "No requests"
                }
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Provider Breakdown */}
        {llmUsage?.byProvider && Object.keys(llmUsage.byProvider).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>LLM Provider Breakdown</CardTitle>
              <CardDescription>
                Usage and costs by AI provider last 30 days
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(llmUsage.byProvider).map(([provider, data]: [string, any], index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Brain className="h-5 w-5 text-green-500" />
                      <div>
                        <div className="font-medium">{provider}</div>
                        <div className="text-sm text-muted-foreground">
                          {formatNumber(data.tokens)} tokens • {formatNumber(data.requests)} requests
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{formatCurrency(data.cost)}</div>
                      <div className="text-sm text-muted-foreground">
                        {((data.cost / (llmUsage.totalCost || 1)) * 100).toFixed(1)}% of total
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}