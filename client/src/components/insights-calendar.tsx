import { useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Clock, Info, Calendar, ExternalLink } from 'lucide-react';
import { Link } from 'wouter';

interface CalendarInsight {
  id: string;
  message: string;
  dueDate: string | null; // Fixed: should be camelCase like the schema
  priority: 'low' | 'medium' | 'high';
  type: string;
  actionUrl: string; // Fixed: should be camelCase like the schema
  documentId: number;
}

interface InsightsResponse {
  insights: CalendarInsight[];
  total: number;
  filters: {
    status?: string;
    type?: string;
    priority?: string;
    sort?: string;
    has_due_date?: boolean;
  };
}

// Priority color mapping for calendar events
const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'high': return '#ef4444'; // Red
    case 'medium': return '#f59e0b'; // Amber  
    case 'low': return '#3b82f6'; // Blue
    default: return '#6b7280'; // Gray
  }
};

// Priority icon mapping
const getPriorityIcon = (priority: string) => {
  switch (priority) {
    case 'high': return <AlertTriangle className="w-4 h-4 text-red-600" />;
    case 'medium': return <Clock className="w-4 h-4 text-amber-600" />;
    case 'low': return <Info className="w-4 h-4 text-blue-600" />;
    default: return <Info className="w-4 h-4 text-gray-600" />;
  }
};

interface InsightsCalendarProps {
  statusFilter?: string;
  typeFilter?: string;
  priorityFilter?: string;
}

export function InsightsCalendar({ 
  statusFilter = 'open', 
  typeFilter = 'all', 
  priorityFilter = 'all' 
}: InsightsCalendarProps) {
  const [selectedEvent, setSelectedEvent] = useState<CalendarInsight | null>(null);

  // Fetch insights with due dates for calendar view
  const { data: insightsData, isLoading, error } = useQuery<InsightsResponse>({
    queryKey: ['/api/insights', statusFilter, typeFilter, priorityFilter, 'calendar'],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('has_due_date', 'true'); // Only get insights with due dates
      if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter);
      if (typeFilter && typeFilter !== 'all') params.append('type', typeFilter);
      if (priorityFilter && priorityFilter !== 'all') params.append('priority', priorityFilter);

      const response = await fetch(`/api/insights?${params.toString()}`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch insights');
      }
      
      return response.json();
    },
    refetchInterval: 60000, // Refresh every minute
  });

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Calendar View
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse">
            <div className="h-96 bg-gray-200 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Calendar View
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <p className="text-gray-600">Failed to load calendar insights</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const insights = insightsData?.insights || [];

  // Convert insights to FullCalendar events
  const calendarEvents = insights
    .filter(insight => insight.dueDate) // Fixed: use dueDate
    .map(insight => ({
      id: insight.id,
      title: insight.message,
      date: insight.dueDate!, // Fixed: use dueDate
      backgroundColor: getPriorityColor(insight.priority),
      borderColor: getPriorityColor(insight.priority),
      textColor: '#ffffff',
      extendedProps: {
        insight: insight,
        priority: insight.priority,
        type: insight.type,
        actionUrl: insight.actionUrl, // Fixed: use actionUrl
      }
    }));

  const handleEventClick = (eventInfo: any) => {
    const insight = eventInfo.event.extendedProps.insight;
    setSelectedEvent(insight);
  };

  const handleDateClick = () => {
    setSelectedEvent(null);
  };

  return (
    <div className="space-y-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Calendar View
            <Badge variant="secondary" className="ml-auto">
              {insights.length} insights with dates
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {insights.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 mb-2">No insights with due dates</p>
              <p className="text-sm text-gray-500">
                Insights with due dates will appear here as calendar events
              </p>
            </div>
          ) : (
            <div style={{ minHeight: '500px' }}>
              <FullCalendar
                plugins={[dayGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                events={calendarEvents}
                eventClick={handleEventClick}
                dateClick={handleDateClick}
                height="auto"
                headerToolbar={{
                  left: 'prev,next today',
                  center: 'title',
                  right: 'dayGridMonth,dayGridWeek'
                }}
                eventDisplay="block"
                dayMaxEvents={3}
                moreLinkClick="popover"
                eventDidMount={(info) => {
                  // Add hover effects and tooltip
                  info.el.title = `${info.event.title} (${info.event.extendedProps.priority} priority)`;
                  info.el.style.cursor = 'pointer';
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Event Details Modal/Panel */}
      {selectedEvent && (
        <Card className="w-full border-l-4" 
              style={{ borderLeftColor: getPriorityColor(selectedEvent.priority) }}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                {getPriorityIcon(selectedEvent.priority)}
                Insight Details
              </CardTitle>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setSelectedEvent(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="font-medium text-gray-900 mb-2">
                {selectedEvent.message}
              </p>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  Due: {selectedEvent.dueDate}
                </div>
                <Badge variant="outline" className="capitalize">
                  {selectedEvent.priority} Priority
                </Badge>
                <Badge variant="secondary">
                  {selectedEvent.type.replace('_', ' ')}
                </Badge>
              </div>
            </div>
            <div className="pt-2 border-t">
              <Link href={selectedEvent.actionUrl}>
                <Button className="w-full">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View Document
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}