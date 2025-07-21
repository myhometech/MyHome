import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Mail, Forward, Check, Clock, AlertCircle, Copy, TestTube, History } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { EmailForward } from "@shared/schema";

export function EmailForwarding() {
  const [showHistory, setShowHistory] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get forwarding address
  const { data: forwardingInfo, isLoading: forwardingLoading } = useQuery<{
    address: string;
    instructions: string;
  }>({
    queryKey: ["/api/email/forwarding-address"],
  });

  // Get email history
  const { data: emailHistory = [], isLoading: historyLoading } = useQuery<EmailForward[]>({
    queryKey: ["/api/email/history"],
    enabled: showHistory,
  });

  // Test email processing
  const testEmailMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/email/test");
      return await response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Email test successful",
        description: `Created ${data.documentsCreated} test document(s)`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email/history"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Test failed",
        description: error.message || "Failed to test email processing",
        variant: "destructive",
      });
    },
  });

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied to clipboard",
        description: "Email address copied successfully",
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Please copy the email address manually",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "processed":
        return <Check className="h-4 w-4 text-green-600" />;
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case "failed":
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "processed":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "failed":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (forwardingLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Email Document Forwarding
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <Forward className="h-5 w-5 text-blue-600 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-medium text-blue-900">How it works</h4>
            <p className="text-sm text-blue-700 mt-1">
              Forward emails with attachments to your personal email address below. 
              Attachments will be automatically saved to your document library and categorized.
            </p>
          </div>
        </div>

{forwardingInfo && (
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Your forwarding email address:</label>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 px-3 py-2 bg-gray-100 border rounded text-sm font-mono">
                  {forwardingInfo.address}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(forwardingInfo.address)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="text-sm text-gray-600">
              <p>{forwardingInfo.instructions}</p>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => testEmailMutation.mutate()}
            disabled={testEmailMutation.isPending}
            size="sm"
          >
            <TestTube className="h-4 w-4 mr-2" />
            {testEmailMutation.isPending ? "Testing..." : "Test Email Processing"}
          </Button>

          <Dialog open={showHistory} onOpenChange={setShowHistory}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <History className="h-4 w-4 mr-2" />
                View History
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Email Processing History</DialogTitle>
              </DialogHeader>
              
              <div className="max-h-96 overflow-y-auto">
                {historyLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                  </div>
                ) : emailHistory.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Mail className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    <p>No emails processed yet</p>
                    <p className="text-sm">Forward an email to get started</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {emailHistory.map((email) => (
                      <Card key={email.id} className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {getStatusIcon(email.status)}
                              <Badge variant="outline" className={getStatusColor(email.status)}>
                                {email.status}
                              </Badge>
                              {email.hasAttachments && (
                                <Badge variant="secondary" className="text-xs">
                                  {email.attachmentCount} attachment{email.attachmentCount !== 1 ? 's' : ''}
                                </Badge>
                              )}
                            </div>
                            <h4 className="font-medium truncate">{email.subject}</h4>
                            <p className="text-sm text-gray-600">From: {email.fromEmail}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {formatDate(email.processedAt!)}
                            </p>
                            {email.documentsCreated && email.documentsCreated > 0 && (
                              <p className="text-sm text-green-600 mt-1">
                                ✓ Created {email.documentsCreated} document{email.documentsCreated !== 1 ? 's' : ''}
                              </p>
                            )}
                            {email.errorMessage && (
                              <p className="text-sm text-red-600 mt-1">
                                Error: {email.errorMessage}
                              </p>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="text-xs text-gray-500 space-y-1">
          <p>• Supported attachments: PDF, JPG, PNG, Word documents</p>
          <p>• Email content will be saved as PDF if no attachments are found</p>
          <p>• Documents are automatically categorized based on filename and content</p>
        </div>
      </CardContent>
    </Card>
  );
}