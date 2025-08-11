import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Mail, Copy, Clock, User, MessageSquare } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface EmailContext {
  messageId: string;
  from: string;
  to: string[];
  subject: string;
  receivedAt: string;
  ingestGroupId?: string;
}

interface EmailMetadataPanelProps {
  emailContext: EmailContext;
  className?: string;
}

const EmailMetadataPanel: React.FC<EmailMetadataPanelProps> = ({
  emailContext,
  className
}) => {
  const { toast } = useToast();

  // Extract display name and email from "Display Name <email@domain.com>" format
  const parseEmailAddress = (address: string) => {
    const match = address.match(/^(.+?)\s*<(.+?)>$/) || address.match(/^(.+)$/);
    if (match && match[2]) {
      return {
        displayName: match[1].trim(),
        email: match[2].trim()
      };
    }
    return {
      displayName: address.trim(),
      email: address.trim()
    };
  };

  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString);
    const utcTime = date.toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
    const localTime = date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    return { utcTime, localTime };
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied to clipboard",
        description: `${label} copied successfully`,
      });
      
      // Analytics
      console.log(`📊 email_metadata_copied: field=${label.toLowerCase().replace(' ', '_')}`);
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Unable to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const { displayName: fromName, email: fromEmail } = parseEmailAddress(emailContext.from);
  const { utcTime, localTime } = formatDateTime(emailContext.receivedAt);
  
  // Handle multiple recipients
  const primaryRecipient = emailContext.to[0] || '';
  const additionalRecipients = emailContext.to.length - 1;

  // Analytics - track panel view
  React.useEffect(() => {
    console.log('📊 email_metadata_panel_viewed: messageId=', emailContext.messageId);
  }, [emailContext.messageId]);

  return (
    <Card className={`border-0 shadow-none bg-blue-50 ${className || ''}`}>
      <CardHeader className="pb-2 px-4 pt-3">
        <CardTitle className="text-sm font-medium text-blue-900 flex items-center gap-2">
          <Mail className="w-4 h-4" />
          Email Details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-3">
        {/* From */}
        <div className="flex items-start gap-2">
          <User className="w-4 h-4 text-gray-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-600 mb-1">From</div>
            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {fromName}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{emailContext.from}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 opacity-70 hover:opacity-100"
                onClick={() => copyToClipboard(emailContext.from, 'From address')}
                aria-label={`Copy from address: ${emailContext.from}`}
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
            <div className="text-xs text-gray-500 truncate">
              {fromEmail}
            </div>
          </div>
        </div>

        {/* To */}
        <div className="flex items-start gap-2">
          <Mail className="w-4 h-4 text-gray-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-600 mb-1">To</div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-900 truncate">
                {truncateText(primaryRecipient, 30)}
              </span>
              {additionalRecipients > 0 && (
                <Badge variant="secondary" className="text-xs">
                  +{additionalRecipients} more
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 opacity-70 hover:opacity-100"
                onClick={() => copyToClipboard(emailContext.to.join(', '), 'Recipients')}
                aria-label={`Copy recipients: ${emailContext.to.join(', ')}`}
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>

        {/* Subject */}
        <div className="flex items-start gap-2">
          <MessageSquare className="w-4 h-4 text-gray-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-600 mb-1">Subject</div>
            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="text-sm font-medium text-gray-900 line-clamp-2 cursor-help">
                      {emailContext.subject}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">{emailContext.subject}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 opacity-70 hover:opacity-100"
                onClick={() => copyToClipboard(emailContext.subject, 'Subject')}
                aria-label={`Copy subject: ${emailContext.subject}`}
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>

        {/* Received At */}
        <div className="flex items-start gap-2">
          <Clock className="w-4 h-4 text-gray-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-600 mb-1">Received</div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="text-sm text-gray-900 cursor-help">
                    {localTime}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-center">
                    <div className="font-medium">{utcTime}</div>
                    <div className="text-xs opacity-75">Local: {localTime}</div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Message ID (collapsed) */}
        <div className="flex items-start gap-2">
          <div className="w-4 h-4 flex-shrink-0" /> {/* Spacer */}
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-500 mb-1">Message ID</div>
            <div className="flex items-center gap-2">
              <code className="text-xs text-gray-600 font-mono bg-gray-100 px-1 py-0.5 rounded">
                {truncateText(emailContext.messageId, 20)}
              </code>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 opacity-70 hover:opacity-100"
                onClick={() => copyToClipboard(emailContext.messageId, 'Message ID')}
                aria-label={`Copy message ID: ${emailContext.messageId}`}
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>

        {/* Source indicator */}
        <div className="pt-1 border-t border-blue-200">
          <Badge variant="outline" className="text-xs bg-blue-100 text-blue-800 border-blue-300">
            <Mail className="w-3 h-3 mr-1" />
            Email Import
          </Badge>
          {emailContext.ingestGroupId && (
            <span className="text-xs text-gray-500 ml-2">
              Group: {emailContext.ingestGroupId.slice(-6)}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default EmailMetadataPanel;