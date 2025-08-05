// TICKET 8: Analytics Dashboard for Scan Flow
// Simple analytics visualization component

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart3, TrendingUp, TrendingDown, Activity } from 'lucide-react';

interface ScanAnalytics {
  scanStarted: number;
  scanUploaded: number;
  ocrFailed: number;
  insightsGenerated: number;
  conversionRate: number;
  avgProcessingTime: number;
}

interface AnalyticsDashboardProps {
  data?: ScanAnalytics;
  isVisible?: boolean;
}

export function AnalyticsDashboard({ data, isVisible = false }: AnalyticsDashboardProps) {
  if (!isVisible || !data) {
    return null;
  }

  const successRate = data.scanUploaded > 0 ? ((data.scanUploaded - data.ocrFailed) / data.scanUploaded * 100).toFixed(1) : '0';
  const insightGenRate = data.scanUploaded > 0 ? (data.insightsGenerated / data.scanUploaded * 100).toFixed(1) : '0';

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Scan Flow Analytics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{data.scanStarted}</div>
            <div className="text-sm text-muted-foreground">Scans Started</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{data.scanUploaded}</div>
            <div className="text-sm text-muted-foreground">Scans Uploaded</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{data.ocrFailed}</div>
            <div className="text-sm text-muted-foreground">OCR Failures</div>
          </div>
          
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{data.insightsGenerated}</div>
            <div className="text-sm text-muted-foreground">Insights Generated</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <div className="text-sm text-muted-foreground">Conversion Rate</div>
              <div className="text-lg font-semibold">{data.conversionRate.toFixed(1)}%</div>
            </div>
            {data.conversionRate >= 70 ? (
              <TrendingUp className="h-5 w-5 text-green-500" />
            ) : (
              <TrendingDown className="h-5 w-5 text-red-500" />
            )}
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <div className="text-sm text-muted-foreground">Success Rate</div>
              <div className="text-lg font-semibold">{successRate}%</div>
            </div>
            <Badge variant={parseFloat(successRate) >= 85 ? "default" : "destructive"}>
              {parseFloat(successRate) >= 85 ? "Good" : "Needs Work"}
            </Badge>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <div className="text-sm text-muted-foreground">Insight Rate</div>
              <div className="text-lg font-semibold">{insightGenRate}%</div>
            </div>
            <Activity className="h-5 w-5 text-blue-500" />
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          * Analytics tracked for browser-native scanning flow
        </div>
      </CardContent>
    </Card>
  );
}

export default AnalyticsDashboard;