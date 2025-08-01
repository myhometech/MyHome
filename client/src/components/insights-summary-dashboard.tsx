import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  AlertTriangle, 
  Clock, 
  CheckCircle, 
  TrendingUp, 
  Brain,
  Calendar,
  DollarSign,
  Users,
  Shield,
  ListTodo,
  FileText
} from "lucide-react";

interface DocumentInsight {
  id: string;
  documentId: number;
  type: 'summary' | 'action_items' | 'key_dates' | 'financial_info' | 'contacts' | 'compliance';
  priority: 'high' | 'medium' | 'low';
  status: 'open' | 'resolved' | 'dismissed';
  title: string;
  content: string;
  dueDate?: string;
  confidence: number;
  documentName?: string;
}

interface InsightsSummaryDashboardProps {
  insights: DocumentInsight[];
  onFilterChange: (filter: { status?: string; priority?: string; type?: string }) => void;
}

export default function InsightsSummaryDashboard({ insights, onFilterChange }: InsightsSummaryDashboardProps) {
  // Calculate summary metrics
  const totalInsights = insights.length;
  const openInsights = insights.filter(i => i.status === 'open' || !i.status);
  const highPriority = insights.filter(i => i.priority === 'high' && (i.status === 'open' || !i.status));
  const mediumPriority = insights.filter(i => i.priority === 'medium' && (i.status === 'open' || !i.status));
  const resolvedInsights = insights.filter(i => i.status === 'resolved');
  
  // Type breakdowns
  const actionItems = insights.filter(i => i.type === 'action_items' && (i.status === 'open' || !i.status));
  const keyDates = insights.filter(i => i.type === 'key_dates' && (i.status === 'open' || !i.status));
  const financial = insights.filter(i => i.type === 'financial_info' && (i.status === 'open' || !i.status));
  const compliance = insights.filter(i => i.type === 'compliance' && (i.status === 'open' || !i.status));

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <Brain className="h-8 w-8 text-purple-600" />
        <div>
          <h1 className="text-2xl font-bold">AI Insights Dashboard</h1>
          <p className="text-gray-600">Smart insights from your document library</p>
        </div>
      </div>

      {/* Summary Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Open Insights */}
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Open Items</p>
                <p className="text-2xl font-bold">{openInsights.length}</p>
              </div>
              <div className="h-12 w-12 bg-blue-50 rounded-lg flex items-center justify-center">
                <ListTodo className="h-6 w-6 text-blue-600" />
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-2 text-xs"
              onClick={() => onFilterChange({ status: 'open', priority: 'all', type: 'all' })}
            >
              View All Open
            </Button>
          </CardContent>
        </Card>

        {/* High Priority */}
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">High Priority</p>
                <p className="text-2xl font-bold text-red-600">{highPriority.length}</p>
              </div>
              <div className="h-12 w-12 bg-red-50 rounded-lg flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-2 text-xs"
              onClick={() => onFilterChange({ status: 'open', priority: 'high', type: 'all' })}
            >
              View High Priority
            </Button>
          </CardContent>
        </Card>

        {/* Action Items */}
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Action Items</p>
                <p className="text-2xl font-bold text-orange-600">{actionItems.length}</p>
              </div>
              <div className="h-12 w-12 bg-orange-50 rounded-lg flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-orange-600" />
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-2 text-xs"
              onClick={() => onFilterChange({ status: 'open', priority: 'all', type: 'action_items' })}
            >
              View Actions
            </Button>
          </CardContent>
        </Card>

        {/* Resolved */}
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Resolved</p>
                <p className="text-2xl font-bold text-green-600">{resolvedInsights.length}</p>
              </div>
              <div className="h-12 w-12 bg-green-50 rounded-lg flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-2 text-xs"
              onClick={() => onFilterChange({ status: 'resolved', priority: 'all', type: 'all' })}
            >
              View Resolved
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Quick Insights by Type */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold">Insights by Category</h3>
            <Badge variant="secondary" className="px-1.5 py-0.5 text-xs">
              {totalInsights} Total
            </Badge>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex flex-col items-center gap-1 h-auto py-2"
              onClick={() => onFilterChange({ status: 'open', priority: 'all', type: 'action_items' })}
            >
              <CheckCircle className="h-4 w-4 text-orange-600" />
              <span className="text-xs">Actions</span>
              <Badge variant="secondary" className="text-xs">{actionItems.length}</Badge>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="flex flex-col items-center gap-1 h-auto py-2"
              onClick={() => onFilterChange({ status: 'open', priority: 'all', type: 'key_dates' })}
            >
              <Calendar className="h-4 w-4 text-purple-600" />
              <span className="text-xs">Dates</span>
              <Badge variant="secondary" className="text-xs">{keyDates.length}</Badge>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="flex flex-col items-center gap-1 h-auto py-2"
              onClick={() => onFilterChange({ status: 'open', priority: 'all', type: 'financial_info' })}
            >
              <DollarSign className="h-4 w-4 text-green-600" />
              <span className="text-xs">Financial</span>
              <Badge variant="secondary" className="text-xs">{financial.length}</Badge>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="flex flex-col items-center gap-1 h-auto py-2"
              onClick={() => onFilterChange({ status: 'open', priority: 'all', type: 'compliance' })}
            >
              <Shield className="h-4 w-4 text-red-600" />
              <span className="text-xs">Compliance</span>
              <Badge variant="secondary" className="text-xs">{compliance.length}</Badge>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="flex flex-col items-center gap-1 h-auto py-2"
              onClick={() => onFilterChange({ status: 'open', priority: 'all', type: 'contacts' })}
            >
              <Users className="h-4 w-4 text-indigo-600" />
              <span className="text-xs">Contacts</span>
              <Badge variant="secondary" className="text-xs">
                {insights.filter(i => i.type === 'contacts' && (i.status === 'open' || !i.status)).length}
              </Badge>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="flex flex-col items-center gap-1 h-auto py-2"
              onClick={() => onFilterChange({ status: 'open', priority: 'all', type: 'summary' })}
            >
              <FileText className="h-4 w-4 text-blue-600" />
              <span className="text-xs">Summaries</span>
              <Badge variant="secondary" className="text-xs">
                {insights.filter(i => i.type === 'summary' && (i.status === 'open' || !i.status)).length}
              </Badge>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}