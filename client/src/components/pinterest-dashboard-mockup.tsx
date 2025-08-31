
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Brain, 
  Clock, 
  FileText, 
  Users,
  Calendar,
  DollarSign,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  Star,
  ArrowRight,
  Eye,
  Heart,
  Share2,
  Bookmark
} from 'lucide-react';

interface DocumentInsight {
  id: string;
  type: 'summary' | 'action_items' | 'key_dates' | 'financial_info' | 'contacts' | 'compliance';
  title: string;
  content: string;
  confidence: number;
  priority: 'low' | 'medium' | 'high';
  metadata?: Record<string, any>;
  createdAt: string;
  documentName?: string;
}

const insightTypeConfig = {
  summary: { 
    icon: FileText, 
    label: 'Summary', 
    gradient: 'from-blue-400 via-blue-500 to-blue-600',
    bgGradient: 'from-blue-50 via-white to-blue-100',
    shadow: 'shadow-blue-200/40'
  },
  contacts: { 
    icon: Users, 
    label: 'Contacts', 
    gradient: 'from-emerald-400 via-emerald-500 to-emerald-600',
    bgGradient: 'from-emerald-50 via-white to-emerald-100',
    shadow: 'shadow-emerald-200/40'
  },
  action_items: { 
    icon: CheckCircle, 
    label: 'Actions', 
    gradient: 'from-orange-400 via-orange-500 to-orange-600',
    bgGradient: 'from-orange-50 via-white to-orange-100',
    shadow: 'shadow-orange-200/40'
  },
  key_dates: { 
    icon: Calendar, 
    label: 'Dates', 
    gradient: 'from-purple-400 via-purple-500 to-purple-600',
    bgGradient: 'from-purple-50 via-white to-purple-100',
    shadow: 'shadow-purple-200/40'
  },
  financial_info: { 
    icon: DollarSign, 
    label: 'Financial', 
    gradient: 'from-green-400 via-green-500 to-green-600',
    bgGradient: 'from-green-50 via-white to-green-100',
    shadow: 'shadow-green-200/40'
  },
  compliance: { 
    icon: AlertCircle, 
    label: 'Compliance', 
    gradient: 'from-red-400 via-red-500 to-red-600',
    bgGradient: 'from-red-50 via-white to-red-100',
    shadow: 'shadow-red-200/40'
  }
};

export function PinterestDashboardMockup() {
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  // Mock data for demonstration
  const mockInsights: DocumentInsight[] = [
    {
      id: '1',
      type: 'summary',
      title: 'Annual Insurance Policy Review',
      content: 'Your home insurance policy is due for renewal next month. Consider reviewing coverage limits and comparing quotes from other providers to ensure optimal protection.',
      confidence: 0.95,
      priority: 'high',
      createdAt: '2024-01-15T10:30:00Z',
      documentName: 'Home_Insurance_Policy.pdf'
    },
    {
      id: '2',
      type: 'action_items',
      title: 'Vehicle Registration Renewal',
      content: 'Vehicle registration expires in 14 days. Renew online or visit the DMV office. Required documents: current registration, proof of insurance.',
      confidence: 0.88,
      priority: 'high',
      createdAt: '2024-01-14T15:20:00Z',
      documentName: 'Vehicle_Registration.pdf'
    },
    {
      id: '3',
      type: 'financial_info',
      title: 'Investment Portfolio Summary',
      content: 'Q4 portfolio performance shows 12% growth. Recommended rebalancing: reduce tech exposure by 5%, increase international bonds allocation.',
      confidence: 0.92,
      priority: 'medium',
      createdAt: '2024-01-13T09:15:00Z',
      documentName: 'Investment_Statement.pdf'
    },
    {
      id: '4',
      type: 'key_dates',
      title: 'Tax Document Deadlines',
      content: 'W-2 forms typically arrive by January 31st. Schedule tax preparation appointment early to avoid rush. Estimated payment due March 15th.',
      confidence: 0.87,
      priority: 'medium',
      createdAt: '2024-01-12T14:45:00Z',
      documentName: 'Tax_Documents.pdf'
    },
    {
      id: '5',
      type: 'contacts',
      title: 'Insurance Agent Contact',
      content: 'Sarah Johnson - State Farm Agent. Direct line: (555) 123-4567. Email: sarah.johnson@statefarm.com. Office hours: Mon-Fri 9AM-6PM.',
      confidence: 0.91,
      priority: 'low',
      createdAt: '2024-01-11T11:30:00Z',
      documentName: 'Insurance_Contact.pdf'
    },
    {
      id: '6',
      type: 'compliance',
      title: 'Safety Inspection Required',
      content: 'Annual vehicle safety inspection due by February 28th. Schedule appointment at certified inspection station. Bring current registration and insurance proof.',
      confidence: 0.89,
      priority: 'medium',
      createdAt: '2024-01-10T16:20:00Z',
      documentName: 'Inspection_Notice.pdf'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Pinterest-style Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-pink-400 to-purple-600 rounded-2xl blur opacity-30"></div>
                <div className="relative bg-gradient-to-r from-pink-500 to-purple-600 p-3 rounded-2xl">
                  <Brain className="h-8 w-8 text-white" />
                </div>
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                  Smart Insights
                </h1>
                <p className="text-gray-500 text-lg">Discover what matters in your documents</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Button variant="outline" className="rounded-full px-6 py-2 border-gray-300 hover:border-purple-300 hover:bg-purple-50">
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
              <Button className="rounded-full px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-lg">
                <Brain className="h-4 w-4 mr-2" />
                Analyze More
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Pinterest-style Masonry Grid */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="columns-1 md:columns-2 lg:columns-3 xl:columns-4 gap-6 space-y-6">
          {mockInsights.map((insight) => {
            const config = insightTypeConfig[insight.type];
            const IconComponent = config.icon;
            
            return (
              <div 
                key={insight.id}
                className={`break-inside-avoid relative group cursor-pointer transform transition-all duration-300 hover:scale-105 ${config.shadow} hover:shadow-2xl`}
                onMouseEnter={() => setHoveredCard(insight.id)}
                onMouseLeave={() => setHoveredCard(null)}
              >
                {/* Pinterest-style Card */}
                <div className={`bg-gradient-to-br ${config.bgGradient} rounded-3xl overflow-hidden border border-white/50 backdrop-blur-sm`}>
                  {/* Card Header with Gradient */}
                  <div className={`bg-gradient-to-r ${config.gradient} p-6 relative overflow-hidden`}>
                    {/* Decorative circles */}
                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-10 translate-x-10"></div>
                    <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/10 rounded-full translate-y-8 -translate-x-8"></div>
                    
                    <div className="relative flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-white/20 backdrop-blur-sm rounded-2xl">
                          <IconComponent className="h-6 w-6 text-white" />
                        </div>
                        <div>
                          <h3 className="text-white font-bold text-lg leading-tight">
                            {insight.title}
                          </h3>
                          <Badge className="bg-white/20 text-white border-white/30 mt-2">
                            {config.label}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    
                    {/* Confidence indicator */}
                    <div className="mt-4 flex items-center gap-2">
                      <Star className="h-4 w-4 text-yellow-300 fill-current" />
                      <span className="text-white/90 text-sm font-medium">
                        {Math.round(insight.confidence * 100)}% confidence
                      </span>
                    </div>
                  </div>

                  {/* Card Content */}
                  <div className="p-6">
                    <p className="text-gray-700 leading-relaxed text-sm mb-4 line-clamp-4">
                      {insight.content}
                    </p>
                    
                    {/* Meta information */}
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{new Date(insight.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        <span className="truncate max-w-24">{insight.documentName}</span>
                      </div>
                    </div>
                  </div>

                  {/* Pinterest-style interaction bar */}
                  <div className={`px-6 pb-6 transition-opacity duration-200 ${hoveredCard === insight.id ? 'opacity-100' : 'opacity-0'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" className="rounded-full h-8 w-8 p-0 hover:bg-red-50">
                          <Heart className="h-4 w-4 text-gray-600 hover:text-red-500" />
                        </Button>
                        <Button variant="ghost" size="sm" className="rounded-full h-8 w-8 p-0 hover:bg-blue-50">
                          <Share2 className="h-4 w-4 text-gray-600 hover:text-blue-500" />
                        </Button>
                        <Button variant="ghost" size="sm" className="rounded-full h-8 w-8 p-0 hover:bg-yellow-50">
                          <Bookmark className="h-4 w-4 text-gray-600 hover:text-yellow-600" />
                        </Button>
                      </div>
                      
                      <Button size="sm" className={`rounded-full px-4 py-1 bg-gradient-to-r ${config.gradient} text-white text-xs hover:scale-105 transition-transform`}>
                        <Eye className="h-3 w-3 mr-1" />
                        View
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
