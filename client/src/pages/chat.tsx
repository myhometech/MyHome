import { useFeatures } from "@/hooks/useFeatures";
import { FeatureGate } from "@/components/feature-gate";
import { ChatWindow } from "@/components/chat-window";
import Header from "@/components/header";

export default function ChatPage() {
  const { hasFeature } = useFeatures();
  
  return (
    <FeatureGate
      feature="CHAT_ENABLED"
      fallback={
        <div className="min-h-screen bg-background">
          <Header />
          <div className="container mx-auto px-4 py-8">
            <div className="max-w-md mx-auto text-center">
              <h1 className="text-2xl font-bold mb-4">Chat Assistant</h1>
              <p className="text-muted-foreground">
                Chat features are not available on your current plan. 
                Please upgrade to access the document assistant.
              </p>
            </div>
          </div>
        </div>
      }
    >
      <div className="min-h-screen bg-background">
        <Header />
        <ChatWindow />
      </div>
    </FeatureGate>
  );
}