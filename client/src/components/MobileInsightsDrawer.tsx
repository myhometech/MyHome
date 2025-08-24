import { useState, useEffect, useRef } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ArrowUp, Brain } from "lucide-react";
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
          className={`
            fixed bottom-6 left-1/2 -translate-x-1/2 z-50
            md:hidden lg:hidden
            bg-primary hover:bg-primary/90 text-primary-foreground
            shadow-lg border border-border/20
            px-4 py-3 rounded-full
            flex items-center gap-2
            transition-all duration-200 ease-out
            min-h-[44px] min-w-[120px]
            active:scale-95 hover:shadow-xl
            mobile-insights-trigger mobile-touch-target
            ${className}
          `}
          style={{ 
            paddingBottom: 'max(12px, env(safe-area-inset-bottom))'
          }}
          aria-label="Open AI Insights"
        >
          <Brain className="h-4 w-4 shrink-0" />
          <span className="font-medium text-sm">Insights</span>
        </Button>
      </SheetTrigger>

      {/* Drawer content - responsive height from bottom */}
      <SheetContent 
        side="bottom" 
        className="
          h-[65vh] min-h-[400px] max-h-[80vh]
          sm:h-[70vh] sm:max-h-[700px]
          bg-background border-t border-border
          rounded-t-xl sm:rounded-t-2xl
          p-0 mx-0 w-full
          max-w-full sm:max-w-screen-sm sm:mx-auto
        "
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Header with visual indicator and back navigation */}
        <div className="
          sticky top-0 z-10 
          bg-background/95 backdrop-blur-sm border-b border-border/50 
          px-3 py-3 sm:px-6 sm:py-4
          min-h-[60px] max-w-full overflow-hidden
        ">
          <div className="flex items-center justify-center mb-2 sm:mb-3">
            {/* Drag indicator - touch-friendly */}
            <div className="
              w-12 h-1.5 sm:w-16 sm:h-2 
              bg-muted-foreground/40 hover:bg-muted-foreground/60
              rounded-full cursor-grab active:cursor-grabbing
              transition-colors duration-200
            " />
          </div>

          <div className="flex items-center justify-between min-w-0 gap-2">
            {/* Clickable header area on mobile */}
            <div 
              className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 mr-2 cursor-pointer hover:bg-white/40 rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors md:cursor-default md:hover:bg-transparent"
              onClick={() => setIsOpen(false)}
              title="Tap to close insights"
            >
              <div className="
                p-2 rounded-lg bg-primary/10 
                ring-1 ring-primary/20
              ">
                <Brain className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1 overflow-hidden">
                <h2 className="
                  text-base sm:text-lg font-semibold text-foreground
                  tracking-tight truncate
                ">
                  AI Insights
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground truncate">
                  {documentName}
                </p>
              </div>
            </div>

            {/* Back to Document button - desktop only */}
            <Button
              variant="default"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="hidden sm:flex shrink-0 h-8 px-3 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
            >
              <ArrowUp className="h-3 w-3 mr-1" />
              Back
            </Button>
          </div>
        </div>

        {/* Scrollable insights content */}
        <div 
          ref={scrollContainerRef}
          className="
            flex-1 overflow-y-auto overflow-x-hidden
            px-3 sm:px-6
            pb-6 sm:pb-8
            mobile-insights-scroll mobile-insights-drawer
            mobile-insights-small max-w-full
          "
          style={{
            paddingBottom: 'max(24px, calc(24px + env(safe-area-inset-bottom)))',
          }}
        >
          <div className="
            space-y-3 sm:space-y-4 pt-3 sm:pt-4
            max-w-full sm:max-w-lg mx-auto
            mobile-insights-large-mobile
          " data-insight-section>
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