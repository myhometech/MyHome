import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { Activity, AlertCircle, Info, Shield, Clock } from "lucide-react";

interface SystemActivity {
  id: number;
  type: 'user_registered' | 'document_uploaded' | 'user_login' | 'feature_flag_changed' | 'admin_action';
  description: string;
  userId: string;
  userEmail: string;
  severity: 'info' | 'warning' | 'security';
  metadata?: Record<string, any>;
  timestamp: string;
}

export function ActivityLog() {
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  const { data: activities, isLoading } = useQuery<SystemActivity[]>({
    queryKey: ['/api/admin/activities', severityFilter],
    queryFn: async () => {
      const params = severityFilter !== 'all' ? `?severity=${severityFilter}` : '';
      const response = await fetch(`/api/admin/activities${params}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch activities: ${response.status}`);
      }
      return response.json();
    },
  });

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'security':
        return <Shield className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getSeverityVariant = (severity: string) => {
    switch (severity) {
      case 'security':
        return 'destructive' as const;
      case 'warning':
        return 'secondary' as const;
      default:
        return 'default' as const;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  if (isLoading) {
    return <div className="text-center py-4">Loading activity log...</div>;
  }

  if (!activities || activities.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
        No activity logs found
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4" />
          <span className="text-sm font-medium">Filter by severity:</span>
        </div>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="security">Security</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Severity</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activities.map((activity) => (
              <TableRow key={activity.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {getSeverityIcon(activity.severity)}
                    <Badge variant={getSeverityVariant(activity.severity)}>
                      {activity.severity}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{activity.type.replace('_', ' ')}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{activity.userEmail}</span>
                    <span className="text-xs text-muted-foreground">
                      {activity.userId.slice(0, 8)}...
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm">{activity.description}</span>
                  {activity.metadata && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {JSON.stringify(activity.metadata)}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{formatTimestamp(activity.timestamp)}</span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="text-sm text-muted-foreground">
        Showing {activities.length} activities
      </div>
    </div>
  );
}