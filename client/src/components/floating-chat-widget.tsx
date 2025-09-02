import { useState, useCallback } from "react";
import { MessageCircle, X, Send, Home, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  hasRetry?: boolean;
  originalMessage?: string;
}

export default function FloatingChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const { toast } = useToast();

  // Create conversation when chat is first opened
  const initializeConversation = async () => {
    if (conversationId) return conversationId;
    
    try {
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: 'Quick Chat'
        })
      });
      
      if (response.ok) {
        const conversation = await response.json();
        setConversationId(conversation.id);
        return conversation.id;
      } else {
        throw new Error('Failed to create conversation');
      }
    } catch (error) {
      console.error('Failed to initialize conversation:', error);
      throw error;
    }
  };

  // Enhanced message sending with retry logic and detailed error handling
  const handleSendMessage = useCallback(async (messageText?: string, isRetry = false) => {
    const messageToSend = messageText || inputValue.trim();
    if (!messageToSend) return;

    // Only add user message if not a retry
    if (!isRetry) {
      const userMessage: Message = {
        id: Date.now().toString(),
        content: messageToSend,
        role: 'user',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, userMessage]);
      setInputValue("");
      setRetryCount(0);
    }

    setIsLoading(true);

    try {
      // Ensure we have a conversation
      const activeConversationId = await initializeConversation();
      
      // Create abort controller for client-side timeout
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, 30000); // 30-second client-side timeout

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include',
        signal: abortController.signal,
        body: JSON.stringify({
          message: messageToSend,
          conversationId: activeConversationId
        })
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: data.answer,
          role: 'assistant',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, assistantMessage]);
        setRetryCount(0); // Reset retry count on success
        
        // Show success toast for retries
        if (isRetry) {
          toast({
            title: "Message sent successfully!",
            description: "Your message was processed.",
          });
        }
      } else {
        await handleChatError(response, messageToSend);
      }
    } catch (error: any) {
      console.error('Chat error:', error);
      
      if (error.name === 'AbortError') {
        // Client-side timeout
        handleTimeoutError(messageToSend);
      } else if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        // Network error
        handleNetworkError(messageToSend);
      } else {
        // Generic error
        handleGenericError(messageToSend, error.message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, conversationId, retryCount, toast]);

  // Handle HTTP errors from the server
  const handleChatError = async (response: Response, originalMessage: string) => {
    try {
      const errorData = await response.json();
      const errorMessage = errorData.message || errorData.error || 'Unknown error';
      
      switch (response.status) {
        case 400:
          addErrorMessage("Please check your message format and try again.", originalMessage);
          toast({
            title: "Invalid request",
            description: errorMessage,
            variant: "destructive"
          });
          break;
          
        case 404:
          // Conversation not found - reset and try again
          setConversationId(null);
          if (retryCount < 2) {
            toast({
              title: "Starting new conversation",
              description: "Creating a fresh conversation for you...",
            });
            setTimeout(() => handleSendMessage(originalMessage, true), 1000);
            setRetryCount(prev => prev + 1);
          } else {
            addErrorMessage("Unable to create conversation. Please refresh the page.", originalMessage);
          }
          break;
          
        case 429:
          // Rate limit - suggest retry with delay
          addErrorMessage("Too many requests. Please wait a moment before trying again.", originalMessage, true);
          toast({
            title: "Rate limit exceeded",
            description: "Please wait a moment before sending another message",
            variant: "destructive"
          });
          break;
          
        case 504:
          // Timeout - offer retry
          handleTimeoutError(originalMessage);
          break;
          
        default:
          addErrorMessage(errorMessage || "We couldn't send that. Please retry.", originalMessage, true);
          toast({
            title: "Something went wrong",
            description: errorMessage,
            variant: "destructive"
          });
      }
    } catch (parseError) {
      addErrorMessage("We couldn't send that. Please retry.", originalMessage, true);
      toast({
        title: "Error processing response",
        description: "Please try again",
        variant: "destructive"
      });
    }
  };

  const handleTimeoutError = (originalMessage: string) => {
    addErrorMessage("The request timed out. This might be due to high server load.", originalMessage, true);
    toast({
      title: "Request timeout",
      description: "The message took too long to process",
      variant: "destructive"
    });
  };

  const handleNetworkError = (originalMessage: string) => {
    addErrorMessage("Connection lost. Please check your internet and try again.", originalMessage, true);
    toast({
      title: "Network error", 
      description: "Please check your connection",
      variant: "destructive"
    });
  };

  const handleGenericError = (originalMessage: string, errorMessage: string) => {
    const userFriendlyMessage = "Sorry, something unexpected happened. Please try again.";
    addErrorMessage(userFriendlyMessage, originalMessage, true);
    toast({
      title: "Unexpected error",
      description: userFriendlyMessage,
      variant: "destructive"
    });
  };

  const addErrorMessage = (content: string, originalMessage?: string, hasRetry = false) => {
    const errorMessage: Message = {
      id: (Date.now() + 1).toString(),
      content,
      role: 'assistant',
      timestamp: new Date(),
      hasRetry,
      originalMessage
    };
    setMessages(prev => [...prev, errorMessage]);
  };

  const handleRetry = (originalMessage: string) => {
    if (retryCount >= 3) {
      toast({
        title: "Max retries reached",
        description: "Please try a different message or refresh the page",
        variant: "destructive"
      });
      return;
    }
    
    setRetryCount(prev => prev + 1);
    handleSendMessage(originalMessage, true);
  };

  const sendMessage = () => handleSendMessage();

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Floating Chat Button */}
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          onClick={() => setIsOpen(true)}
          className="h-14 w-14 rounded-full bg-purple-600 hover:bg-purple-700 shadow-lg hover:shadow-xl transition-all duration-200"
          data-testid="floating-chat-button"
        >
          <Home className="h-6 w-6 text-white" />
        </Button>
      </div>

      {/* Chat Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-4">
          {/* Background overlay */}
          <div 
            className="absolute inset-0 bg-black/20" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Chat Window */}
          <Card className="relative w-full max-w-sm h-96 shadow-2xl border-0 bg-white">
            <CardHeader className="p-4 bg-purple-600 text-white rounded-t-lg">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Home className="h-5 w-5" />
                  MyHome Assistant
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  className="text-white hover:bg-purple-700 h-8 w-8 p-0"
                  data-testid="close-chat-widget"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            
            <CardContent className="p-0 flex flex-col h-80">
              {/* Messages Area */}
              <ScrollArea className="flex-1 p-4">
                {messages.length === 0 ? (
                  <div className="text-center text-gray-500 mt-8">
                    <Home className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p className="text-sm">Hi! I'm your MyHome assistant.</p>
                    <p className="text-xs mt-1">Ask me about your documents!</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] p-3 rounded-lg text-sm ${
                            message.role === 'user'
                              ? 'bg-purple-600 text-white'
                              : 'bg-gray-100 text-gray-900'
                          }`}
                        >
                          {message.content}
                          {message.hasRetry && message.originalMessage && (
                            <div className="mt-2 pt-2 border-t border-gray-200">
                              <Button
                                onClick={() => handleRetry(message.originalMessage!)}
                                size="sm"
                                variant="ghost"
                                className="h-6 text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50 p-1"
                                data-testid="retry-chat-message"
                              >
                                <RotateCcw className="h-3 w-3 mr-1" />
                                Retry
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {isLoading && (
                      <div className="flex justify-start">
                        <div className="bg-gray-100 p-3 rounded-lg text-sm">
                          <div className="flex space-x-1">
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </ScrollArea>
              
              {/* Input Area */}
              <div className="p-4 border-t">
                <div className="flex gap-2">
                  <Input
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Ask about your documents..."
                    className="flex-1 text-sm"
                    disabled={isLoading}
                    data-testid="chat-message-input"
                  />
                  <Button
                    onClick={sendMessage}
                    disabled={!inputValue.trim() || isLoading}
                    size="sm"
                    className="bg-purple-600 hover:bg-purple-700"
                    data-testid="send-chat-message"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}