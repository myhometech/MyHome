import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { Search, TrendingUp, Users, BarChart3, Calendar, Crown } from "lucide-react";

interface SearchAnalytics {
  totalSearches: number;
  uniqueUsers: number;
  noResultRate: number;
  averageResultsPerQuery: number;
  topQueries: Array<{
    query: string;
    count: number;
    resultCount: number;
    lastSearched: string;
  }>;
  searchesByTier: {
    free: number;
    premium: number;
  };
  searchesByTimeRange: Array<{
    date: string;
    searches: number;
  }>;
}

export function SearchAnalytics() {
  const [timeRange, setTimeRange] = useState<string>('7d');
  const [tierFilter, setTierFilter] = useState<string>('all');

  const { data: analytics, isLoading } = useQuery<SearchAnalytics>({
    queryKey: ['/api/admin/search-analytics', timeRange, tierFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (timeRange !== '7d') {
        params.append('timeRange', timeRange);
      }
      if (tierFilter !== 'all') {
        params.append('tier', tierFilter);
      }
      const response = await fetch(`/api/admin/search-analytics?${params.toString()}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch search analytics: ${response.status}`);
      }
      return response.json();
    },
  });

  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (isLoading) {
    return <div className="text-center py-4">Loading search analytics...</div>;
  }

  if (!analytics) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
        No search analytics data available
      </div>
    );
  }

  const totalSearchesForTier = analytics.searchesByTier.free + analytics.searchesByTier.premium;
  const premiumPercentage = totalSearchesForTier > 0 ? (analytics.searchesByTier.premium / totalSearchesForTier) * 100 : 0;
  const freePercentage = totalSearchesForTier > 0 ? (analytics.searchesByTier.free / totalSearchesForTier) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          <span className="text-sm font-medium">Time range:</span>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1d">Last 24h</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Crown className="h-4 w-4" />
          <span className="text-sm font-medium">Tier:</span>
        </div>
        <Select value={tierFilter} onValueChange={setTierFilter}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tiers</SelectItem>
            <SelectItem value="free">Free</SelectItem>
            <SelectItem value="premium">Premium</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Searches</CardTitle>
            <Search className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.totalSearches.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {analytics.uniqueUsers} unique users
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">No Results Rate</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPercentage(analytics.noResultRate)}</div>
            <p className="text-xs text-muted-foreground">
              Searches with 0 results
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Results</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.averageResultsPerQuery.toFixed(1)}</div>
            <p className="text-xs text-muted-foreground">
              Results per query
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Premium Searches</CardTitle>
            <Crown className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatPercentage(premiumPercentage)}
            </div>
            <p className="text-xs text-muted-foreground">
              vs {formatPercentage(freePercentage)} free
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Top Queries Table */}
      <Card>
        <CardHeader>
          <CardTitle>Top Search Queries</CardTitle>
          <CardDescription>
            Most popular search terms and their performance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Query</TableHead>
                  <TableHead>Search Count</TableHead>
                  <TableHead>Avg Results</TableHead>
                  <TableHead>Performance</TableHead>
                  <TableHead>Last Searched</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.topQueries.map((query, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Search className="h-4 w-4 text-muted-foreground" />
                        <span className="font-mono text-sm">"{query.query}"</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-bold">{query.count}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono">{query.resultCount}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={query.resultCount > 0 ? 'default' : 'destructive'}>
                        {query.resultCount > 0 ? 'Good' : 'No Results'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {formatDate(query.lastSearched)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {analytics.topQueries.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
              No search queries found for this time period
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}