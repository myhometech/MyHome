import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useFeatures } from "@/hooks/useFeatures";
import { MessageCircle, Send, Filter, X, ChevronLeft, FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EnhancedDocumentViewer } from "@/components/enhanced-document-viewer";

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
  messageCount?: number;
}

interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  confidence?: number;
  createdAt: string;
}

interface Citation {
  docId: string;
  page: number;
  title?: string;
}

interface ChatFilters {
  provider?: string;
  docType?: string[];
  dateFrom?: string;
  dateTo?: string;
}

export function ChatWindow() {
  const { toast } = useToast();
  const { hasFeature } = useFeatures();
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [isConversationListOpen, setIsConversationListOpen] = useState(true);
  const [currentMessage, setCurrentMessage] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<ChatFilters>({});
  const [selectedDocument, setSelectedDocument] = useState<{ id: number; page?: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check if user is authenticated first
  const { data: authStatus } = useQuery({
    queryKey: ['/api/auth/me'],
    queryFn: async () => {
      const response = await fetch('/api/auth/me', { credentials: 'include' });
      if (!response.ok) {
        if (response.status === 401) return null; // Not authenticated
        throw new Error('Failed to check auth status');
      }
      return response.json();
    },
    retry: false,
  });

  // Check if chat is enabled (only if authenticated)
  const { data: chatConfig } = useQuery({
    queryKey: ['/api/config'],
    queryFn: async () => {
      const response = await fetch('/api/config', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch config');
      return response.json();
    },
    enabled: !!authStatus,
  });

  // Fetch conversations list (only if authenticated and chat enabled)
  const { data: conversations = [] } = useQuery({
    queryKey: ['/api/conversations'],
    queryFn: async () => {
      const response = await fetch('/api/conversations', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch conversations');
      return response.json();
    },
    enabled: !!authStatus && chatConfig?.chat?.enabled,
  });

  // Fetch messages for selected conversation
  const { data: messages = [] } = useQuery({
    queryKey: ['/api/conversations', selectedConversation, 'messages'],
    queryFn: async () => {
      const response = await fetch(`/api/conversations/${selectedConversation}/messages`, { 
        credentials: 'include' 
      });
      if (!response.ok) throw new Error('Failed to fetch messages');
      return response.json();
    },
    enabled: !!selectedConversation,
  });

  // Create new conversation mutation
  const createConversationMutation = useMutation({
    mutationFn: async (title: string) => {
      const response = await apiRequest('POST', '/api/conversations', { title });
      return response.json();
    },
    onSuccess: (data: Conversation) => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      setSelectedConversation(data.id);
      setIsConversationListOpen(false);
    },
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({ conversationId, message, filters }: { 
      conversationId: string; 
      message: string; 
      filters?: ChatFilters;
    }) => {
      return apiRequest('POST', '/api/chat', {
        conversationId,
        message,
        filters,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['/api/conversations', selectedConversation, 'messages'] 
      });
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      setCurrentMessage("");
    },
    onError: (error) => {
      toast({
        title: "Failed to send message",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    },
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle sending a message
  const handleSendMessage = async () => {
    if (!currentMessage.trim()) return;

    let conversationId = selectedConversation;

    // Create new conversation if none selected
    if (!conversationId) {
      try {
        const conversation = await createConversationMutation.mutateAsync(
          currentMessage.slice(0, 50) + (currentMessage.length > 50 ? '...' : '')
        );
        conversationId = conversation.id;
      } catch (error) {
        return; // Error handling is done in the mutation
      }
    }

    // Send the message
    sendMessageMutation.mutate({
      conversationId: conversationId!,
      message: currentMessage,
      filters: Object.keys(filters).length > 0 ? filters : undefined,
    });
  };

  // Handle citation click
  const handleCitationClick = (citation: Citation) => {
    setSelectedDocument({ id: parseInt(citation.docId), page: citation.page });
  };

  // If user is not authenticated, show auth required state
  if (!authStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              Chat Assistant
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Please log in to access the chat assistant.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // If chat is not enabled, show disabled state
  if (!chatConfig?.chat?.enabled) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              Chat Assistant
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Chat features are currently disabled. Check back later or contact support.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="flex h-screen">
        {/* Conversation List Panel */}
        <div className={`${isConversationListOpen ? 'w-80' : 'w-0'} transition-all duration-300 overflow-hidden border-r bg-muted/30`}>
          <div className="p-4 border-b">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Conversations</h2>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  createConversationMutation.mutate("New Chat");
                }}
                disabled={createConversationMutation.isPending}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2">
            {conversations.map((conversation: Conversation) => (
              <Button
                key={conversation.id}
                variant={selectedConversation === conversation.id ? "secondary" : "ghost"}
                className="w-full justify-start mb-1 h-auto p-3 text-left"
                onClick={() => {
                  setSelectedConversation(conversation.id);
                  setIsConversationListOpen(false);
                }}
              >
                <div className="flex flex-col items-start">
                  <span className="font-medium truncate w-full">
                    {conversation.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(conversation.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </Button>
            ))}
            
            {conversations.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                <MessageCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No conversations yet</p>
                <p className="text-sm">Start a new chat to begin</p>
              </div>
            )}
          </div>
        </div>

        {/* Main Chat Panel */}
        <div className="flex-1 flex flex-col">
          {/* Chat Header */}
          <div className="p-4 border-b bg-background">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsConversationListOpen(!isConversationListOpen)}
                >
                  <ChevronLeft className={`h-4 w-4 transition-transform ${isConversationListOpen ? 'rotate-0' : 'rotate-180'}`} />
                </Button>
                <h1 className="font-semibold">
                  {selectedConversation ? 
                    conversations.find((c: Conversation) => c.id === selectedConversation)?.title || "Chat" 
                    : "Document Assistant"
                  }
                </h1>
              </div>
              
              {chatConfig?.chat?.showFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFilters(true)}
                >
                  <Filter className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {!selectedConversation ? (
              <div className="text-center py-12">
                <MessageCircle className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-xl font-semibold mb-2">Ask me about your documents</h3>
                <p className="text-muted-foreground mb-6">
                  I can help you find information, dates, amounts, and more from your uploaded documents.
                </p>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>Try asking:</p>
                  <p>"How much was my phone bill last month?"</p>
                  <p>"When does my insurance policy expire?"</p>
                  <p>"What documents do I have from O2?"</p>
                </div>
              </div>
            ) : (
              <>
                {messages.map((message: Message) => (
                  <MessageBubble 
                    key={message.id}
                    message={message}
                    onCitationClick={handleCitationClick}
                  />
                ))}
                
                {sendMessageMutation.isPending && (
                  <MessageBubble 
                    message={{
                      id: 'pending',
                      conversationId: selectedConversation,
                      role: 'user' as const,
                      content: currentMessage,
                      createdAt: new Date().toISOString(),
                    }}
                    isPending
                  />
                )}
                
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input Bar */}
          <div className="p-4 border-t bg-background">
            <div className="flex gap-2">
              <Textarea
                placeholder="Ask me anything about your documents..."
                value={currentMessage}
                onChange={(e) => setCurrentMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                className="flex-1 min-h-[40px] max-h-32"
                disabled={sendMessageMutation.isPending}
              />
              <Button 
                onClick={handleSendMessage}
                disabled={!currentMessage.trim() || sendMessageMutation.isPending}
                size="lg"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Filters Dialog */}
      <ChatFiltersDialog 
        open={showFilters}
        onOpenChange={setShowFilters}
        filters={filters}
        onFiltersChange={setFilters}
      />

      {/* Document Viewer */}
      {selectedDocument && (
        <EnhancedDocumentViewer
          document={{
            id: selectedDocument.id,
            name: `Document ${selectedDocument.id}`,
            mimeType: 'application/pdf',
            fileSize: 0
          }}
          onClose={() => setSelectedDocument(null)}
          onDownload={() => {}}
          initialTab={selectedDocument.page ? 'view' : undefined}
        />
      )}
    </div>
  );
}

// Message Bubble Component
function MessageBubble({ 
  message, 
  onCitationClick, 
  isPending = false 
}: { 
  message: Message; 
  onCitationClick?: (citation: Citation) => void;
  isPending?: boolean;
}) {
  const isUser = message.role === 'user';
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] ${isUser ? 'order-2' : 'order-1'}`}>
        <div className={`p-4 rounded-lg ${
          isUser 
            ? 'bg-primary text-primary-foreground ml-12' 
            : 'bg-muted mr-12'
        } ${isPending ? 'opacity-60' : ''}`}>
          
          {message.content === 'INSUFFICIENT_EVIDENCE' ? (
            <InsufficientEvidenceCard />
          ) : (
            <>
              <div className="whitespace-pre-wrap">{message.content}</div>
              
              {message.citations && message.citations.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {message.citations.map((citation, index) => (
                    <Button
                      key={index}
                      variant="secondary"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => onCitationClick?.(citation)}
                    >
                      <FileText className="h-3 w-3 mr-1" />
                      {citation.title || `Doc ${citation.docId}`} – p.{citation.page}
                    </Button>
                  ))}
                </div>
              )}
              
              {message.confidence !== undefined && message.confidence < 0.7 && (
                <Badge variant="outline" className="mt-2 text-xs">
                  Uncertain response
                </Badge>
              )}
            </>
          )}
        </div>
        
        <div className={`text-xs text-muted-foreground mt-1 ${
          isUser ? 'text-right' : 'text-left'
        }`}>
          {isPending ? 'Sending...' : new Date(message.createdAt).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}

// Insufficient Evidence Card
function InsufficientEvidenceCard() {
  return (
    <div className="text-center py-4">
      <div className="bg-muted-foreground/10 rounded-lg p-4">
        <MessageCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <h4 className="font-medium mb-2">We couldn't find that information</h4>
        <p className="text-sm text-muted-foreground">
          I couldn't find specific information about that in your documents. 
          Try rephrasing your question or check if you have the relevant documents uploaded.
        </p>
      </div>
    </div>
  );
}

// Chat Filters Dialog
function ChatFiltersDialog({ 
  open, 
  onOpenChange, 
  filters, 
  onFiltersChange 
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: ChatFilters;
  onFiltersChange: (filters: ChatFilters) => void;
}) {
  const [tempFilters, setTempFilters] = useState(filters);

  const handleApply = () => {
    onFiltersChange(tempFilters);
    onOpenChange(false);
  };

  const handleClear = () => {
    const clearedFilters = {};
    setTempFilters(clearedFilters);
    onFiltersChange(clearedFilters);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Search Filters</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Provider</label>
            <Input
              placeholder="e.g., O2, British Gas"
              value={tempFilters.provider || ''}
              onChange={(e) => setTempFilters(prev => ({
                ...prev,
                provider: e.target.value || undefined
              }))}
            />
          </div>
          
          <div>
            <label className="text-sm font-medium mb-2 block">Document Type</label>
            <Select
              value={tempFilters.docType?.[0] || ''}
              onValueChange={(value) => setTempFilters(prev => ({
                ...prev,
                docType: value ? [value] : undefined
              }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select document type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bill">Bills</SelectItem>
                <SelectItem value="invoice">Invoices</SelectItem>
                <SelectItem value="statement">Statements</SelectItem>
                <SelectItem value="policy">Policies</SelectItem>
                <SelectItem value="receipt">Receipts</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm font-medium mb-2 block">From Date</label>
              <Input
                type="date"
                value={tempFilters.dateFrom || ''}
                onChange={(e) => setTempFilters(prev => ({
                  ...prev,
                  dateFrom: e.target.value || undefined
                }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">To Date</label>
              <Input
                type="date"
                value={tempFilters.dateTo || ''}
                onChange={(e) => setTempFilters(prev => ({
                  ...prev,
                  dateTo: e.target.value || undefined
                }))}
              />
            </div>
          </div>
        </div>
        
        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={handleClear}>
            Clear All
          </Button>
          <Button onClick={handleApply}>
            Apply Filters
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}