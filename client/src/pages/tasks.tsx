import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, FileText, Car, CheckCircle2, AlertTriangle } from "lucide-react";
import Header from '@/components/header';

export default function Tasks() {
  // Placeholder tasks - in real implementation, this would come from an API
  const tasks = [
    {
      id: 1,
      title: 'Vehicle Tax Renewal',
      description: 'Renew vehicle tax for BMW X3 (Registration: ABC123)',
      dueDate: '2025-08-28',
      priority: 'high',
      status: 'pending',
      category: 'vehicle',
      icon: Car,
      daysUntilDue: 14
    },
    {
      id: 2,
      title: 'Insurance Document Review',
      description: 'Review and update home insurance policy documents',
      dueDate: '2025-09-15',
      priority: 'medium',
      status: 'pending',
      category: 'insurance',
      icon: FileText,
      daysUntilDue: 32
    },
    {
      id: 3,
      title: 'MOT Certificate Upload',
      description: 'Upload new MOT certificate for vehicle records',
      dueDate: '2025-08-20',
      priority: 'high',
      status: 'completed',
      category: 'vehicle',
      icon: Car,
      daysUntilDue: 6
    },
    {
      id: 4,
      title: 'Annual Property Inspection',
      description: 'Schedule and document annual property inspection',
      dueDate: '2025-10-01',
      priority: 'low',
      status: 'pending',
      category: 'property',
      icon: FileText,
      daysUntilDue: 48
    }
  ];

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'overdue': return <AlertTriangle className="h-5 w-5 text-red-600" />;
      default: return <Clock className="h-5 w-5 text-yellow-600" />;
    }
  };

  const pendingTasks = tasks.filter(task => task.status === 'pending');
  const completedTasks = tasks.filter(task => task.status === 'completed');

  return (
    <div className="min-h-screen bg-[#FAF4EF]">
      <Header />
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <Calendar className="h-6 w-6 text-[#1E90FF]" />
            <h1 className="text-2xl font-bold text-[#2B2F40]">Tasks & Deadlines</h1>
          </div>
          <p className="text-sm text-gray-600 mt-1">Keep track of important deadlines and document-related tasks</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Pending Tasks */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Pending Tasks</h2>
              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 text-xs">
                {pendingTasks.length} pending
              </Badge>
            </div>
            
            <div className="space-y-3">
              {pendingTasks.map((task) => (
                <Card key={task.id} className="border-l-4 border-l-yellow-500 hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-2">
                        <task.icon className="h-4 w-4 text-gray-600 mt-0.5" />
                        <div>
                          <CardTitle className="text-sm font-semibold text-gray-900 mb-1">
                            {task.title}
                          </CardTitle>
                          <CardDescription className="text-xs text-gray-600">
                            {task.description}
                          </CardDescription>
                        </div>
                      </div>
                      {getStatusIcon(task.status)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="flex items-center text-xs text-gray-500">
                          <Calendar className="h-3 w-3 mr-1" />
                          Due {task.dueDate}
                        </div>
                        <Badge className={`${getPriorityColor(task.priority)} text-xs`}>
                          {task.priority} priority
                        </Badge>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-gray-500">
                          {task.daysUntilDue} days remaining
                        </span>
                        <Button size="sm" variant="outline" className="text-xs">
                          Mark Complete
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Completed Tasks */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Completed Tasks</h2>
              <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">
                {completedTasks.length} completed
              </Badge>
            </div>
            
            <div className="space-y-4">
              {completedTasks.map((task) => (
                <Card key={task.id} className="border-l-4 border-l-green-500 bg-green-50 hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <task.icon className="h-5 w-5 text-gray-600 mt-1" />
                        <div>
                          <CardTitle className="text-lg font-semibold text-gray-900 mb-1">
                            {task.title}
                          </CardTitle>
                          <CardDescription className="text-gray-600">
                            {task.description}
                          </CardDescription>
                        </div>
                      </div>
                      {getStatusIcon(task.status)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center text-sm text-gray-500">
                          <Calendar className="h-4 w-4 mr-1" />
                          Completed {task.dueDate}
                        </div>
                        <Badge className={getPriorityColor(task.priority)}>
                          {task.priority} priority
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>

        {/* Empty state */}
        {tasks.length === 0 && (
          <Card className="text-center py-12">
            <CardContent>
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No tasks yet</h3>
              <p className="text-gray-600">Tasks and deadlines will appear here as they are created.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}