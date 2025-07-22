import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { 
  Mail, 
  Copy, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  FileText, 
  Paperclip,
  Send,
  Info,
  Zap
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface EmailForward {
  id: number;
  fromEmail: string;
  subject: string;
  hasAttachments: boolean;
  attachmentCount: number;
  documentsCreated: number;
  status: 'pending' | 'processed' | 'failed';
  processedAt: string;
  errorMessage?: string;
}

export default function EmailImport() {
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get forwarding address
  const { data: forwardingData, isLoading: isLoadingAddress } = useQuery({
    queryKey: ['/api/email/forwarding-address'],
  });

  // Get email history
  const { data: emailHistory, isLoading: isLoadingHistory } = useQuery({
    queryKey: ['/api/email/history'],
  });

  // Test email processing
  const testEmailMutation = useMutation({
    mutationFn: () => apiRequest('/api/email/test', 'POST'),
    onSuccess: (data: any) => {
      toast({
        title: "Test Email Processed",
        description: `Successfully created ${data.documentsCreated || 0} document(s)`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/email/history'] });
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
    },
    onError: (error: any) => {
      toast({
        title: "Test Failed",
        description: error.message || "Failed to process test email",
        variant: "destructive",
      });
    },
  });

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedToClipboard(true);
      toast({
        title: "Copied!",
        description: "Email address copied to clipboard",
      });
      setTimeout(() => setCopiedToClipboard(false), 2000);
    } catch (err) {
      toast({
        title: "Copy Failed",
        description: "Unable to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'processed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processed':
        return <CheckCircle className="h-4 w-4" />;
      case 'pending':
        return <Clock className="h-4 w-4" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Email Import</h1>
        <p className="text-gray-600 mt-2">
          Forward documents to your personal email address and they'll be automatically added to your library
        </p>
      </div>

      {/* How it Works */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>How it works:</strong> Forward emails with document attachments to your personal forwarding address. 
          We'll extract attachments and create documents in your library automatically.
        </AlertDescription>
      </Alert>

      {/* Forwarding Address */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Your Forwarding Address
          </CardTitle>
          <CardDescription>
            Forward emails with document attachments to this address
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoadingAddress ? (
            <div className="animate-pulse">
              <div className="h-10 bg-gray-200 rounded"></div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                value={(forwardingData as any)?.forwardingAddress || ''}
                readOnly
                className="font-mono"
              />
              <Button
                variant="outline"
                onClick={() => copyToClipboard((forwardingData as any)?.forwardingAddress || '')}
                disabled={!(forwardingData as any)?.forwardingAddress}
              >
                {copiedToClipboard ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}
          
          <div className="text-sm text-gray-600 space-y-1">
            <p>• Forward emails from any email client to this address</p>
            <p>• Attachments will be extracted and saved as documents</p>
            <p>• Email content will be saved as a PDF document</p>
            <p>• You'll receive a confirmation email when processing is complete</p>
          </div>
        </CardContent>
      </Card>

      {/* Test Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Test Email Import
          </CardTitle>
          <CardDescription>
            Send a test email to verify the system is working
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={() => testEmailMutation.mutate()}
            disabled={testEmailMutation.isPending}
            className="w-full sm:w-auto"
          >
            {testEmailMutation.isPending ? (
              <>
                <Clock className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send Test Email
              </>
            )}
          </Button>
          <p className="text-sm text-gray-600 mt-2">
            This will simulate processing an email with a sample document attachment
          </p>
        </CardContent>
      </Card>

      {/* Email History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Processing History
          </CardTitle>
          <CardDescription>
            Recent emails processed through the forwarding system
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingHistory ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-16 bg-gray-200 rounded"></div>
                </div>
              ))}
            </div>
          ) : !emailHistory || (emailHistory as any[]).length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Mail className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No emails processed yet</p>
              <p className="text-sm">Forward an email to get started</p>
            </div>
          ) : (
            <div className="space-y-4">
              {(emailHistory as EmailForward[]).map((email: EmailForward) => (
                <div key={email.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className={getStatusColor(email.status)}>
                          {getStatusIcon(email.status)}
                          <span className="ml-1 capitalize">{email.status}</span>
                        </Badge>
                        {email.hasAttachments && (
                          <Badge variant="outline">
                            <Paperclip className="h-3 w-3 mr-1" />
                            {email.attachmentCount} attachment{email.attachmentCount !== 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                      
                      <h4 className="font-medium">{email.subject}</h4>
                      <p className="text-sm text-gray-600">From: {email.fromEmail}</p>
                      
                      {email.status === 'processed' && (
                        <p className="text-sm text-green-600 mt-1">
                          ✓ Created {email.documentsCreated} document{email.documentsCreated !== 1 ? 's' : ''}
                        </p>
                      )}
                      
                      {email.status === 'failed' && email.errorMessage && (
                        <p className="text-sm text-red-600 mt-1">
                          ✗ {email.errorMessage}
                        </p>
                      )}
                    </div>
                    
                    <div className="text-right text-sm text-gray-500">
                      {new Date(email.processedAt).toLocaleDateString()}
                      <br />
                      {new Date(email.processedAt).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}