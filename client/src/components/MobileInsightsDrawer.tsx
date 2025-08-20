import { useState, useEffect, useRef } from "react";
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const openTimeRef = useRef<number | null>(null);

  // Analytics event tracking
  const trackInsightsEvent = (eventType: 'open' | 'close', metadata?: Record<string, any>) => {
    const event = {
      type: `insights_drawer_${eventType}`,
      documentId,
      documentName,
      timestamp: new Date().toISOString(),
      ...metadata
    };
    
    // Console logging for now - can be replaced with analytics service
    console.log('🔍 [Analytics] Insights Drawer Event:', event);
    
    // Future: Replace with actual analytics service
    // analytics.track(event.type, event);
  };

  // Track drawer open/close events and handle auto-scroll
  useEffect(() => {
    if (isOpen) {
      // Track drawer opening
      openTimeRef.current = Date.now();
      trackInsightsEvent('open', {
        hasScrollContainer: !!scrollContainerRef.current
      });
    } else if (openTimeRef.current !== null) {
      // Track drawer closing and time spent
      const timeSpent = Date.now() - openTimeRef.current;
      trackInsightsEvent('close', {
        timeSpentMs: timeSpent,
        timeSpentSeconds: Math.round(timeSpent / 1000)
      });
      openTimeRef.current = null;
    }
  }, [isOpen, documentId, documentName]);

  // Auto-scroll to first insight section when drawer opens
  useEffect(() => {
    if (isOpen && scrollContainerRef.current) {
      // Use a small delay to ensure the sheet is fully opened and DOM is ready
      const timer = setTimeout(() => {
        if (scrollContainerRef.current) {
          // Find the first insight heading or content area
          const firstInsightSection = scrollContainerRef.current.querySelector(
            '[data-insight-item="first"], [data-insight-section="header"], .insight-content, [data-insight-section="insights-list"]'
          );
          
          if (firstInsightSection) {
            firstInsightSection.scrollIntoView({ 
              behavior: 'smooth',
              block: 'start',
              inline: 'nearest'
            });
          } else {
            // Fallback: scroll to top if no specific section found
            scrollContainerRef.current.scrollTo({ 
              top: 0, 
              behavior: 'smooth' 
            });
          }
        }
      }, 150); // Small delay for sheet animation

      return () => clearTimeout(timer);
    }
  }, [isOpen]);

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
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-4 pb-6"
        >
          <div className="space-y-4 pt-4" data-insight-section>
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