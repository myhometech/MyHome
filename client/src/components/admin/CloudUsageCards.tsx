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

  const { data: openaiUsage, isLoading: openaiLoading } = useQuery<OpenAIUsage>({
    queryKey: ['/api/admin/usage/openai'],
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatNumber = (num: number) => {
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

  if (gcsLoading || openaiLoading) {
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

      {/* OpenAI Usage Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-green-500" />
          <h3 className="text-lg font-semibold">OpenAI Usage</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
              <Brain className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {openaiUsage ? formatNumber(openaiUsage.totalTokens) : "0"}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {openaiUsage && getTrendIcon(openaiUsage.trend)}
                <span className={getTrendColor(openaiUsage?.trend || 'stable')}>
                  {openaiUsage?.trendPercentage ? `${openaiUsage.trendPercentage}%` : '0%'}
                </span>
                this month
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
                {openaiUsage ? formatCurrency(openaiUsage.costThisMonth) : "$0.00"}
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
                {openaiUsage ? formatNumber(openaiUsage.requestsThisMonth) : "0"}
              </div>
              <p className="text-xs text-muted-foreground">
                This month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Top Model</CardTitle>
              <Badge variant="outline" className="text-xs">
                {openaiUsage?.modelBreakdown?.[0]?.model || "N/A"}
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {openaiUsage?.modelBreakdown?.[0]?.cost ? 
                  formatCurrency(openaiUsage.modelBreakdown[0].cost) : 
                  "$0.00"
                }
              </div>
              <p className="text-xs text-muted-foreground">
                {openaiUsage?.modelBreakdown?.[0]?.requests ? 
                  `${formatNumber(openaiUsage.modelBreakdown[0].requests)} requests` : 
                  "No requests"
                }
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Model Breakdown */}
        {openaiUsage?.modelBreakdown && openaiUsage.modelBreakdown.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>OpenAI Model Breakdown</CardTitle>
              <CardDescription>
                Usage and costs by AI model this month
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {openaiUsage.modelBreakdown.map((model, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Brain className="h-5 w-5 text-green-500" />
                      <div>
                        <div className="font-medium">{model.model}</div>
                        <div className="text-sm text-muted-foreground">
                          {formatNumber(model.tokens)} tokens • {formatNumber(model.requests)} requests
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{formatCurrency(model.cost)}</div>
                      <div className="text-sm text-muted-foreground">
                        {((model.cost / (openaiUsage.costThisMonth || 1)) * 100).toFixed(1)}% of total
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