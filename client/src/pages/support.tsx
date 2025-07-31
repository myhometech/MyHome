import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { 
  HelpCircle, 
  Mail, 
  MessageSquare, 
  Book, 
  Video, 
  FileText,
  ExternalLink,
  Phone,
  Clock,
  CheckCircle,
  AlertTriangle
} from "lucide-react";

// Declare Canny types for TypeScript
declare global {
  interface Window {
    Canny: any;
  }
}

export function Support() {
  const { user } = useAuth();
  const [cannyLoaded, setCannyLoaded] = useState(false);
  const [cannyError, setCannyError] = useState(false);

  useEffect(() => {
    // Load Canny script
    const script = document.createElement('script');
    script.src = 'https://canny.io/sdk.js';
    script.async = true;
    script.onload = () => {
      try {
        if (window.Canny) {
          // Get Canny configuration from environment variables
          const cannyBoardToken = import.meta.env.VITE_CANNY_BOARD_TOKEN;
          const cannyAppId = import.meta.env.VITE_CANNY_APP_ID;
          
          if (!cannyBoardToken || !cannyAppId) {
            console.warn('Canny configuration missing. Please set VITE_CANNY_BOARD_TOKEN and VITE_CANNY_APP_ID environment variables.');
            setCannyError(true);
            return;
          }

          // Initialize Canny
          window.Canny('render', {
            boardToken: cannyBoardToken,
            basePath: null, // Use default Canny URL
            ssoToken: null, // For SSO integration if needed
          });

          // Identify user if authenticated
          if (user) {
            const typedUser = user as any; // Type assertion for user object
            window.Canny('identify', {
              appID: cannyAppId,
              user: {
                email: typedUser.email || '',
                name: `${typedUser.firstName || ''} ${typedUser.lastName || ''}`.trim() || typedUser.email || 'User',
                id: typedUser.id || '',
                // Add any additional user data for Canny analytics
                created: typedUser.createdAt || new Date().toISOString(),
                // Add user role for feedback categorization
                role: typedUser.role || 'user',
              },
            });
          }
          
          setCannyLoaded(true);
        }
      } catch (error) {
        console.error('Error initializing Canny:', error);
        setCannyError(true);
      }
    };
    script.onerror = () => {
      console.error('Failed to load Canny script');
      setCannyError(true);
    };

    document.head.appendChild(script);

    return () => {
      // Cleanup script on unmount
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, [user]);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Support Center</h1>
          <p className="text-lg text-gray-600">
            Submit feedback, get help, and find answers to common questions
          </p>
        </div>

        {/* Main Content with Tabs */}
        <Tabs defaultValue="feedback" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="feedback" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Submit Feedback
            </TabsTrigger>
            <TabsTrigger value="help" className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4" />
              Help & Support
            </TabsTrigger>
          </TabsList>

          {/* Feedback Tab */}
          <TabsContent value="feedback" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-blue-600" />
                  Share Your Feedback
                </CardTitle>
                <CardDescription>
                  Help us improve MyHome by sharing your ideas, reporting bugs, or requesting new features
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Canny Widget Container */}
                <div className="min-h-[600px] w-full">
                  {cannyError && (
                    <Alert className="mb-4">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        Unable to load feedback widget. You can still submit feedback directly at:{" "}
                        <a 
                          href="https://myhome.canny.io" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline font-medium"
                        >
                          myhome.canny.io
                        </a>
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  {!cannyLoaded && !cannyError && (
                    <div className="flex items-center justify-center h-96">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                        <p className="text-gray-500">Loading feedback widget...</p>
                      </div>
                    </div>
                  )}

                  {/* Canny widget will render here */}
                  <div data-canny className={cannyLoaded ? 'block' : 'hidden'}></div>
                  
                  {/* Fallback link */}
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600 mb-2">
                      Having trouble with the widget? Submit feedback directly:
                    </p>
                    <Button variant="outline" asChild>
                      <a 
                        href="https://myhome.canny.io" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Open Feedback Portal
                      </a>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Help Tab */}
          <TabsContent value="help" className="space-y-6">

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center space-x-2">
                <MessageSquare className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-lg">Live Chat</CardTitle>
              </div>
              <CardDescription>
                Get instant help from our support team
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full">
                <MessageSquare className="mr-2 h-4 w-4" />
                Start Chat
              </Button>
              <div className="flex items-center mt-2 text-sm text-gray-500">
                <Clock className="h-3 w-3 mr-1" />
                Usually responds in 2-5 minutes
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center space-x-2">
                <Mail className="h-5 w-5 text-green-600" />
                <CardTitle className="text-lg">Email Support</CardTitle>
              </div>
              <CardDescription>
                Send us a detailed message about your issue
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">
                <Mail className="mr-2 h-4 w-4" />
                Send Email
              </Button>
              <div className="flex items-center mt-2 text-sm text-gray-500">
                <Clock className="h-3 w-3 mr-1" />
                Response within 24 hours
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center space-x-2">
                <Phone className="h-5 w-5 text-purple-600" />
                <CardTitle className="text-lg">Phone Support</CardTitle>
              </div>
              <CardDescription>
                Speak directly with our support team
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">
                <Phone className="mr-2 h-4 w-4" />
                Call Support
              </Button>
              <div className="flex items-center mt-2 text-sm text-gray-500">
                <Clock className="h-3 w-3 mr-1" />
                Mon-Fri 9AM-6PM EST
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Help Categories */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Getting Started */}
          <Card>
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Book className="h-5 w-5 text-blue-600" />
                <CardTitle>Getting Started</CardTitle>
              </div>
              <CardDescription>
                Learn the basics of document management
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
                <div className="flex items-center space-x-3">
                  <FileText className="h-4 w-4 text-gray-600" />
                  <span className="text-sm font-medium">Upload Your First Document</span>
                </div>
                <ExternalLink className="h-4 w-4 text-gray-400" />
              </div>
              
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
                <div className="flex items-center space-x-3">
                  <Video className="h-4 w-4 text-gray-600" />
                  <span className="text-sm font-medium">Mobile Camera Scanning</span>
                </div>
                <ExternalLink className="h-4 w-4 text-gray-400" />
              </div>
              
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
                <div className="flex items-center space-x-3">
                  <HelpCircle className="h-4 w-4 text-gray-600" />
                  <span className="text-sm font-medium">Understanding AI Insights</span>
                </div>
                <ExternalLink className="h-4 w-4 text-gray-400" />
              </div>
            </CardContent>
          </Card>

          {/* Troubleshooting */}
          <Card>
            <CardHeader>
              <div className="flex items-center space-x-2">
                <HelpCircle className="h-5 w-5 text-orange-600" />
                <CardTitle>Troubleshooting</CardTitle>
              </div>
              <CardDescription>
                Solutions to common issues and problems
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
                <div className="flex items-center space-x-3">
                  <Phone className="h-4 w-4 text-gray-600" />
                  <span className="text-sm font-medium">Camera Not Working on Mobile</span>
                </div>
                <Badge variant="secondary" className="text-xs">Popular</Badge>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
                <div className="flex items-center space-x-3">
                  <FileText className="h-4 w-4 text-gray-600" />
                  <span className="text-sm font-medium">Upload Errors and Solutions</span>
                </div>
                <ExternalLink className="h-4 w-4 text-gray-400" />
              </div>
              
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
                <div className="flex items-center space-x-3">
                  <Mail className="h-4 w-4 text-gray-600" />
                  <span className="text-sm font-medium">Email Forwarding Setup</span>
                </div>
                <ExternalLink className="h-4 w-4 text-gray-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* FAQ Section */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span>Frequently Asked Questions</span>
            </CardTitle>
            <CardDescription>
              Quick answers to the most common questions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-l-4 border-blue-500 pl-4">
              <h4 className="font-semibold text-gray-900 mb-2">How do I scan documents with my phone camera?</h4>
              <p className="text-gray-600 text-sm">
                Tap the camera icon in the upload area, allow camera permissions, and point your camera at the document. 
                The app will automatically detect document edges and capture a clear scan.
              </p>
            </div>
            
            <Separator />
            
            <div className="border-l-4 border-green-500 pl-4">
              <h4 className="font-semibold text-gray-900 mb-2">What file types are supported?</h4>
              <p className="text-gray-600 text-sm">
                We support PDF, JPEG, PNG, and WebP files up to 10MB each. The system automatically processes 
                and extracts text from your documents for search and AI insights.
              </p>
            </div>
            
            <Separator />
            
            <div className="border-l-4 border-purple-500 pl-4">
              <h4 className="font-semibold text-gray-900 mb-2">How does AI insight generation work?</h4>
              <p className="text-gray-600 text-sm">
                Our AI analyzes your documents to identify important information like due dates, costs, and deadlines. 
                These insights appear automatically and help you stay on top of important documents.
              </p>
            </div>
            
            <Separator />
            
            <div className="border-l-4 border-orange-500 pl-4">
              <h4 className="font-semibold text-gray-900 mb-2">Is my data secure and private?</h4>
              <p className="text-gray-600 text-sm">
                Yes, all documents are encrypted in transit and at rest. We use enterprise-grade security measures 
                and never share your documents with third parties. You maintain full control over your data.
              </p>
            </div>
          </CardContent>
        </Card>

            {/* Contact Footer */}
            <div className="mt-8 text-center">
              <p className="text-gray-600 mb-4">
                Still need help? Our support team is here to assist you.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Start Live Chat
                </Button>
                <Button variant="outline">
                  <Mail className="mr-2 h-4 w-4" />
                  Email Support
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}