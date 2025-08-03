import { MetricServiceClient } from '@google-cloud/monitoring';
import { Storage } from '@google-cloud/storage';

export interface GCSUsageMetrics {
  totalStorageGB: number;
  totalStorageTB: number;
  costThisMonth: number;
  requestsThisMonth: number;
  bandwidthGB: number;
  trend: 'up' | 'down' | 'stable';
  trendPercentage: number;
}

export class GCSUsageService {
  private metricClient: MetricServiceClient;
  private storage: Storage;
  private projectId: string;
  private bucketName: string;

  constructor() {
    this.projectId = process.env.GCS_PROJECT_ID || 'myhome-467408';
    this.bucketName = process.env.GCS_BUCKET_NAME || 'myhometech-storage';
    
    // Initialize with same credentials as GCS storage
    const clientOptions: any = {
      projectId: this.projectId,
    };

    // Use same authentication pattern as GCSStorage
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      try {
        const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
        clientOptions.credentials = credentials;
      } catch (error) {
        if (process.env.GOOGLE_APPLICATION_CREDENTIALS.endsWith('.json')) {
          clientOptions.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        }
      }
    } else if (process.env.GCS_CREDENTIALS) {
      try {
        clientOptions.credentials = JSON.parse(process.env.GCS_CREDENTIALS);
      } catch (error) {
        console.error('Failed to parse GCS_CREDENTIALS:', error);
      }
    }

    this.metricClient = new MetricServiceClient(clientOptions);
    this.storage = new Storage(clientOptions);
  }

  /**
   * Fetch real Google Cloud Storage usage metrics
   */
  async getGCSUsage(): Promise<GCSUsageMetrics> {
    try {
      const [storageBytes, requestCount, bandwidthBytes] = await Promise.all([
        this.getStorageBytes(),
        this.getRequestCount(),
        this.getBandwidthBytes(),
      ]);

      // Convert bytes to GB/TB
      const totalStorageGB = storageBytes / (1024 ** 3);
      const totalStorageTB = storageBytes / (1024 ** 4);
      const bandwidthGB = bandwidthBytes / (1024 ** 3);

      // Estimate cost based on GCS pricing
      // Standard storage: $0.020 per GB/month
      // Class A operations (writes): $0.005 per 1000 requests
      // Class B operations (reads): $0.0004 per 1000 requests
      // Network egress: ~$0.12 per GB (simplified)
      const storageCost = totalStorageGB * 0.020;
      const requestCost = (requestCount / 1000) * 0.003; // Average of Class A/B
      const bandwidthCost = bandwidthGB * 0.12;
      const costThisMonth = storageCost + requestCost + bandwidthCost;

      // Calculate trend (simplified - compare with previous period)
      const previousMetrics = await this.getPreviousPeriodMetrics();
      const { trend, trendPercentage } = this.calculateTrend(costThisMonth, previousMetrics.cost);

      return {
        totalStorageGB: Math.round(totalStorageGB * 10) / 10,
        totalStorageTB: Math.round(totalStorageTB * 1000) / 1000,
        costThisMonth: Math.round(costThisMonth * 100) / 100,
        requestsThisMonth: requestCount,
        bandwidthGB: Math.round(bandwidthGB * 10) / 10,
        trend,
        trendPercentage: Math.round(trendPercentage * 10) / 10,
      };
    } catch (error) {
      console.error('Error fetching GCS usage metrics:', error);
      // Return minimal real data on error
      return this.getFallbackMetrics();
    }
  }

  /**
   * Get total storage bytes for the bucket
   */
  private async getStorageBytes(): Promise<number> {
    try {
      const projectName = this.metricClient.projectPath(this.projectId);
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const request = {
        name: projectName,
        filter: `metric.type="storage.googleapis.com/storage/total_bytes" AND resource.labels.bucket_name="${this.bucketName}"`,
        interval: {
          endTime: {
            seconds: Math.floor(now.getTime() / 1000),
          },
          startTime: {
            seconds: Math.floor(thirtyDaysAgo.getTime() / 1000),
          },
        },
      };

      const [timeSeries] = await this.metricClient.listTimeSeries(request);
      
      if (timeSeries && timeSeries.length > 0 && timeSeries[0].points && timeSeries[0].points.length > 0) {
        const latestPoint = timeSeries[0].points[0];
        return latestPoint.value?.int64Value ? parseInt(String(latestPoint.value.int64Value)) : 0;
      }

      // Fallback: try to get bucket metadata directly
      const bucket = this.storage.bucket(this.bucketName);
      const [files] = await bucket.getFiles({ maxResults: 1000 });
      let totalSize = 0;
      for (const file of files) {
        const [metadata] = await file.getMetadata();
        totalSize += parseInt(String(metadata.size || 0));
      }
      return totalSize;
    } catch (error) {
      console.error('Error fetching storage bytes:', error);
      return 0;
    }
  }

  /**
   * Get request count for the bucket
   */
  private async getRequestCount(): Promise<number> {
    try {
      const projectName = this.metricClient.projectPath(this.projectId);
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const request = {
        name: projectName,
        filter: `metric.type="storage.googleapis.com/api/request_count" AND resource.labels.bucket_name="${this.bucketName}"`,
        interval: {
          endTime: {
            seconds: Math.floor(now.getTime() / 1000),
          },
          startTime: {
            seconds: Math.floor(thirtyDaysAgo.getTime() / 1000),
          },
        },
      };

      const [timeSeries] = await this.metricClient.listTimeSeries(request);
      
      let totalRequests = 0;
      if (timeSeries && timeSeries.length > 0) {
        for (const series of timeSeries) {
          if (series.points) {
            for (const point of series.points) {
              totalRequests += point.value?.int64Value ? parseInt(String(point.value.int64Value)) : 0;
            }
          }
        }
      }

      return totalRequests;
    } catch (error) {
      console.error('Error fetching request count:', error);
      return 0;
    }
  }

  /**
   * Get bandwidth/egress bytes for the bucket
   */
  private async getBandwidthBytes(): Promise<number> {
    try {
      const projectName = this.metricClient.projectPath(this.projectId);
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const request = {
        name: projectName,
        filter: `metric.type="storage.googleapis.com/network/sent_bytes" AND resource.labels.bucket_name="${this.bucketName}"`,
        interval: {
          endTime: {
            seconds: Math.floor(now.getTime() / 1000),
          },
          startTime: {
            seconds: Math.floor(thirtyDaysAgo.getTime() / 1000),
          },
        },
      };

      const [timeSeries] = await this.metricClient.listTimeSeries(request);
      
      let totalBytes = 0;
      if (timeSeries && timeSeries.length > 0) {
        for (const series of timeSeries) {
          if (series.points) {
            for (const point of series.points) {
              totalBytes += point.value?.int64Value ? parseInt(String(point.value.int64Value)) : 0;
            }
          }
        }
      }

      return totalBytes;
    } catch (error) {
      console.error('Error fetching bandwidth bytes:', error);
      return 0;
    }
  }

  /**
   * Get previous period metrics for trend calculation
   */
  private async getPreviousPeriodMetrics(): Promise<{ cost: number }> {
    try {
      // Get metrics from 30-60 days ago for comparison
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const projectName = this.metricClient.projectPath(this.projectId);
      const request = {
        name: projectName,
        filter: `metric.type="storage.googleapis.com/storage/total_bytes" AND resource.labels.bucket_name="${this.bucketName}"`,
        interval: {
          endTime: {
            seconds: Math.floor(thirtyDaysAgo.getTime() / 1000),
          },
          startTime: {
            seconds: Math.floor(sixtyDaysAgo.getTime() / 1000),
          },
        },
      };

      const [timeSeries] = await this.metricClient.listTimeSeries(request);
      
      if (timeSeries && timeSeries.length > 0 && timeSeries[0].points && timeSeries[0].points.length > 0) {
        const latestPoint = timeSeries[0].points[0];
        const previousBytes = latestPoint.value?.int64Value ? parseInt(String(latestPoint.value.int64Value)) : 0;
        const previousGB = previousBytes / (1024 ** 3);
        const previousCost = previousGB * 0.020; // Simplified cost calculation
        return { cost: previousCost };
      }

      return { cost: 0 };
    } catch (error) {
      console.error('Error fetching previous period metrics:', error);
      return { cost: 0 };
    }
  }

  /**
   * Calculate trend and percentage change
   */
  private calculateTrend(current: number, previous: number): { trend: 'up' | 'down' | 'stable'; trendPercentage: number } {
    if (previous === 0) {
      return { trend: 'stable', trendPercentage: 0 };
    }

    const percentageChange = ((current - previous) / previous) * 100;
    
    if (Math.abs(percentageChange) < 5) {
      return { trend: 'stable', trendPercentage: Math.abs(percentageChange) };
    }

    return {
      trend: percentageChange > 0 ? 'up' : 'down',
      trendPercentage: Math.abs(percentageChange),
    };
  }

  /**
   * Fallback metrics when API calls fail
   */
  private getFallbackMetrics(): GCSUsageMetrics {
    return {
      totalStorageGB: 0,
      totalStorageTB: 0,
      costThisMonth: 0,
      requestsThisMonth: 0,
      bandwidthGB: 0,
      trend: 'stable',
      trendPercentage: 0,
    };
  }
}

export const gcsUsageService = new GCSUsageService();