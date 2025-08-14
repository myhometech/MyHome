import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, Mail, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import Header from '@/components/header';

export default function Notifications() {
  // Placeholder notifications - in real implementation, this would come from an API
  const notifications = [
    {
      id: 1,
      type: 'email_import',
      title: 'New documents imported via email',
      message: '3 documents were imported from your email attachment',
      timestamp: '2 hours ago',
      read: false,
      icon: Mail,
      color: 'bg-blue-500'
    },
    {
      id: 2,
      type: 'expiry_reminder',
      title: 'Document expiring soon',
      message: 'Your insurance document expires in 7 days',
      timestamp: '1 day ago',
      read: false,
      icon: AlertCircle,
      color: 'bg-amber-500'
    },
    {
      id: 3,
      type: 'insight_ready',
      title: 'New insights available',
      message: 'AI has generated new insights from your vehicle documents',
      timestamp: '3 days ago',
      read: true,
      icon: CheckCircle2,
      color: 'bg-green-500'
    },
    {
      id: 4,
      type: 'task_due',
      title: 'Task reminder',
      message: 'Vehicle tax renewal is due next week',
      timestamp: '1 week ago',
      read: true,
      icon: Clock,
      color: 'bg-red-500'
    }
  ];

  return (
    <div className="min-h-screen bg-[#FAF4EF]">
      <Header />
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <Bell className="h-6 w-6 text-[#1E90FF]" />
            <h1 className="text-2xl font-bold text-[#2B2F40]">Notifications</h1>
          </div>
          <p className="text-sm text-gray-600 mt-1">Stay updated with your document management activities</p>
        </div>

        <div className="space-y-3">
          {notifications.map((notification) => (
            <Card key={notification.id} className={`border-l-4 ${!notification.read ? 'bg-white shadow-md' : 'bg-gray-50'} transition-all hover:shadow-lg`}>
              <CardHeader className="pb-2">
                <div className="flex items-start space-x-3">
                  <div className={`p-1.5 rounded-full ${notification.color} text-white flex-shrink-0`}>
                    <notification.icon className="h-3 w-3" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold text-gray-900">
                        {notification.title}
                      </CardTitle>
                      <div className="flex items-center space-x-2">
                        {!notification.read && (
                          <Badge variant="default" className="bg-blue-600 text-xs">
                            New
                          </Badge>
                        )}
                        <span className="text-xs text-gray-500">
                          {notification.timestamp}
                        </span>
                      </div>
                    </div>
                    <CardDescription className="mt-1 text-xs text-gray-600">
                      {notification.message}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>

        {/* Empty state when no notifications */}
        {notifications.length === 0 && (
          <Card className="text-center py-12">
            <CardContent>
              <Bell className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No notifications</h3>
              <p className="text-gray-600">You're all caught up! Check back later for new updates.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}