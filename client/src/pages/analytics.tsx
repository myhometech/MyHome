import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingUp, FileText, Clock, Upload, Eye, Users, Calendar } from "lucide-react";
import Header from '@/components/header';

export default function Analytics() {
  // Placeholder analytics data - in real implementation, this would come from an API
  const stats = {
    totalDocuments: 127,
    documentsThisMonth: 23,
    totalViews: 856,
    avgProcessingTime: '2.3 seconds',
    storageUsed: '2.4 GB',
    storageLimit: '10 GB'
  };

  const activityData = [
    { month: 'Jan', uploads: 15, views: 45, insights: 8 },
    { month: 'Feb', uploads: 22, views: 67, insights: 12 },
    { month: 'Mar', uploads: 18, views: 52, insights: 9 },
    { month: 'Apr', uploads: 25, views: 78, insights: 15 },
    { month: 'May', uploads: 30, views: 89, insights: 18 },
    { month: 'Jun', uploads: 28, views: 94, insights: 16 },
    { month: 'Jul', uploads: 35, views: 112, insights: 22 },
    { month: 'Aug', uploads: 23, views: 67, insights: 14 }
  ];

  const documentTypes = [
    { type: 'Vehicle Documents', count: 45, percentage: 35, color: 'bg-blue-500' },
    { type: 'Insurance Papers', count: 32, percentage: 25, color: 'bg-green-500' },
    { type: 'Property Documents', count: 28, percentage: 22, color: 'bg-purple-500' },
    { type: 'Financial Records', count: 22, percentage: 18, color: 'bg-orange-500' }
  ];

  const insights = [
    {
      title: 'Upload Trends',
      description: 'Document uploads have increased by 15% this month',
      trend: '+15%',
      positive: true
    },
    {
      title: 'Processing Efficiency',
      description: 'Average processing time improved by 12%',
      trend: '-12%',
      positive: true
    },
    {
      title: 'Storage Usage',
      description: 'Currently using 24% of available storage',
      trend: '24%',
      positive: true
    },
    {
      title: 'AI Insights Generated',
      description: 'Generated 14 new insights this week',
      trend: '+14',
      positive: true
    }
  ];

  return (
    <div className="min-h-screen bg-[#FAF4EF]">
      <Header />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-8 w-8 text-[#1E90FF]" />
            <h1 className="text-3xl font-bold text-[#2B2F40]">Analytics & Reports</h1>
          </div>
          <p className="text-gray-600 mt-2">Comprehensive insights into your document management activities</p>
        </div>

        {/* Key Stats */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Documents
              </CardTitle>
              <FileText className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalDocuments}</div>
              <p className="text-xs text-green-600">
                +{stats.documentsThisMonth} this month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Views
              </CardTitle>
              <Eye className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalViews}</div>
              <p className="text-xs text-green-600">
                +12% from last month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Processing Time
              </CardTitle>
              <Clock className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.avgProcessingTime}</div>
              <p className="text-xs text-green-600">
                15% improvement
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                Storage Used
              </CardTitle>
              <Upload className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.storageUsed}</div>
              <p className="text-xs text-gray-600">
                of {stats.storageLimit} limit
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-8 lg:grid-cols-2 mb-8">
          {/* Document Types Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <BarChart3 className="h-5 w-5 mr-2 text-blue-600" />
                Document Types
              </CardTitle>
              <CardDescription>
                Distribution of documents by category
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {documentTypes.map((item) => (
                  <div key={item.type} className="flex items-center space-x-4">
                    <div className={`w-3 h-3 rounded-full ${item.color}`}></div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{item.type}</span>
                        <span className="text-sm text-gray-500">{item.count}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${item.color}`}
                          style={{ width: `${item.percentage}%` }}
                        ></div>
                      </div>
                    </div>
                    <span className="text-sm font-medium text-gray-700">{item.percentage}%</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Key Insights */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <TrendingUp className="h-5 w-5 mr-2 text-green-600" />
                Key Insights
              </CardTitle>
              <CardDescription>
                Important trends and metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {insights.map((insight, index) => (
                  <div key={index} className="flex items-start space-x-3">
                    <div className="w-2 h-2 rounded-full bg-blue-600 mt-2"></div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{insight.title}</span>
                        <Badge 
                          variant="secondary" 
                          className={insight.positive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}
                        >
                          {insight.trend}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600">{insight.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Monthly Activity Chart Placeholder */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Calendar className="h-5 w-5 mr-2 text-purple-600" />
              Monthly Activity Overview
            </CardTitle>
            <CardDescription>
              Document uploads, views, and AI insights generated over time
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
              <div className="text-center">
                <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Interactive charts will be available soon</p>
                <p className="text-sm text-gray-500">Data visualization coming in the next update</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}