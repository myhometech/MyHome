import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Lightbulb } from "lucide-react";
import { DocumentInsights } from "@/components/document-insights";

interface MobileInsightsDrawerProps {
  documentId: number;
  documentName: string;
  className?: string;
}

export function MobileInsightsDrawer({ 
  documentId, 
  documentName, 
  className = "" 
}: MobileInsightsDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      {/* Fixed bottom center trigger button - mobile only */}
      <SheetTrigger asChild>
        <Button
          variant="default"
          size="sm"
          className={`
            fixed bottom-6 left-1/2 -translate-x-1/2 z-50
            md:hidden
            bg-primary hover:bg-primary/90 text-primary-foreground
            shadow-lg border border-border/20
            px-4 py-2 rounded-full
            flex items-center gap-2
            transition-all duration-200
            ${className}
          `}
          aria-label="Open AI Insights"
        >
          <Lightbulb className="h-4 w-4" />
          <span className="font-medium">Insights</span>
        </Button>
      </SheetTrigger>

      {/* Drawer content - 50% height from bottom */}
      <SheetContent 
        side="bottom" 
        className="
          h-[50vh] 
          bg-background border-t border-border
          rounded-t-xl
          p-0
        "
      >
        {/* Header with visual indicator */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border/50 px-4 py-3">
          <div className="flex items-center justify-center mb-2">
            {/* Drag indicator */}
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
          </div>
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">
              AI Insights
            </h2>
          </div>
        </div>

        {/* Scrollable insights content */}
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          <div className="space-y-4 pt-4">
            <DocumentInsights 
              documentId={documentId}
              documentName={documentName}
            />
          </div>
        </div>
      </SheetContent>

    </Sheet>
  );
}

export default MobileInsightsDrawer;