import { useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HelpCircle, X, Lightbulb, Zap, Target, Users, FileText, Calendar, AlertTriangle, Settings } from "lucide-react";

interface HelpContent {
  title: string;
  description: string;
  tips?: string[];
  actions?: Array<{
    label: string;
    description: string;
    icon?: any;
  }>;
  learnMore?: {
    text: string;
    url?: string;
  };
}

interface SmartHelpTooltipProps {
  helpKey: string;
  side?: "top" | "right" | "bottom" | "left";
  children?: React.ReactNode;
  showIcon?: boolean;
  variant?: "default" | "compact" | "detailed";
  className?: string;
}

// Comprehensive help content database
const helpContent: Record<string, HelpContent> = {
  // Document Management
  "document-upload": {
    title: "Upload Documents",
    description: "Upload your important documents for AI-powered organization and insights.",
    tips: [
      "Supported formats: PDF, JPG, PNG, WebP",
      "Maximum file size: 10MB",
      "Multiple files can be uploaded at once"
    ],
    actions: [
      { label: "Camera Scan", description: "Use your device camera to scan documents", icon: Target },
      { label: "File Upload", description: "Select files from your device", icon: FileText },
      { label: "Drag & Drop", description: "Drag files directly onto the upload area", icon: Zap }
    ]
  },
  
  "bulk-select": {
    title: "Bulk Operations",
    description: "Select multiple documents to perform batch operations efficiently.",
    tips: [
      "Click 'Select' to enter selection mode",
      "Use checkboxes to select individual documents",
      "Use 'Select All' for quick selection"
    ],
    actions: [
      { label: "Delete Multiple", description: "Delete selected documents at once", icon: AlertTriangle },
      { label: "Export Batch", description: "Download multiple documents", icon: FileText }
    ]
  },

  "ai-insights": {
    title: "AI Insights",
    description: "Get intelligent analysis and actionable insights from your documents.",
    tips: [
      "AI automatically extracts key information",
      "Insights include dates, actions, and compliance items",
      "Priority levels help you focus on what matters most"
    ],
    actions: [
      { label: "Generate Summary", description: "Create AI-powered document summary", icon: Lightbulb },
      { label: "Extract Dates", description: "Find important dates and deadlines", icon: Calendar },
      { label: "Action Items", description: "Identify tasks and follow-ups", icon: Target }
    ]
  },

  "document-search": {
    title: "Smart Search",
    description: "Find documents quickly with intelligent search capabilities.",
    tips: [
      "Search by document name, content, or tags",
      "Use filters to narrow down results",
      "Search works with OCR-extracted text"
    ],
    actions: [
      { label: "Text Search", description: "Search within document content", icon: FileText },
      { label: "Category Filter", description: "Filter by document categories", icon: Settings },
      { label: "Date Range", description: "Find documents by date", icon: Calendar }
    ]
  },

  "manual-events": {
    title: "Manual Events",
    description: "Track important dates and reminders for your documents and assets.",
    tips: [
      "Create custom reminders and deadlines",
      "Link events to specific documents or assets",
      "Set priority levels for better organization"
    ],
    actions: [
      { label: "Add Event", description: "Create a new reminder or deadline", icon: Calendar },
      { label: "Link Document", description: "Associate event with documents", icon: FileText },
      { label: "Set Priority", description: "Mark as high, medium, or low priority", icon: AlertTriangle }
    ]
  },

  "vehicle-insights": {
    title: "Vehicle Management",
    description: "Track MOT dates, tax renewals, and vehicle compliance automatically.",
    tips: [
      "AI detects vehicle documents and extracts key dates",
      "Get reminders before MOT and tax expiry",
      "DVLA integration provides real-time data"
    ],
    actions: [
      { label: "MOT Tracking", description: "Monitor MOT test dates", icon: Settings },
      { label: "Tax Reminders", description: "Track vehicle tax renewals", icon: Calendar },
      { label: "Compliance Check", description: "Verify vehicle documentation", icon: AlertTriangle }
    ]
  },

  "document-categories": {
    title: "Document Categories",
    description: "Organize your documents using AI-suggested categories for quick access.",
    tips: [
      "Categories are automatically suggested when uploading",
      "Click any category to filter your documents",
      "Create custom categories for better organization"
    ],
    actions: [
      { label: "Auto-Categorize", description: "Let AI suggest categories", icon: Target },
      { label: "Create Category", description: "Add custom category", icon: FileText },
      { label: "Filter View", description: "Show documents by category", icon: Settings }
    ]
  },

  "document-insights": {
    title: "Document Insights",
    description: "AI-extracted insights from your documents including key information and actions.",
    tips: [
      "Insights are automatically generated from document content",
      "Different types include summaries, contacts, dates, and compliance",
      "Click insight buttons to see detailed information"
    ],
    actions: [
      { label: "View Summary", description: "See document overview", icon: FileText },
      { label: "Extract Contacts", description: "Find people and companies", icon: Users },
      { label: "Find Dates", description: "Identify important deadlines", icon: Calendar }
    ]
  },

  // Settings and Account
  "subscription-tiers": {
    title: "Subscription Features",
    description: "Understand the difference between Free and Premium features.",
    tips: [
      "Free: 50 documents, basic features",
      "Premium: Unlimited documents, AI insights, advanced features",
      "Upgrade anytime for more capabilities"
    ],
    actions: [
      { label: "View Features", description: "Compare Free vs Premium", icon: Target },
      { label: "Upgrade Account", description: "Get Premium benefits", icon: Zap },
      { label: "Billing Settings", description: "Manage subscription", icon: Settings }
    ]
  },

  "privacy-security": {
    title: "Privacy & Security",
    description: "Your documents are encrypted and securely stored in the cloud.",
    tips: [
      "All files encrypted with AES-256",
      "Automatic secure backups",
      "No data shared with third parties"
    ],
    learnMore: {
      text: "Read our Privacy Policy",
      url: "/privacy"
    }
  },

  // Feature-specific help
  "insights-priority": {
    title: "Insight Priorities",
    description: "Understanding how AI prioritizes insights to help you focus on what matters.",
    tips: [
      "High Priority: Urgent deadlines, compliance issues",
      "Medium Priority: Important dates, financial info",
      "Low Priority: General summaries, contact details"
    ]
  },

  "ocr-processing": {
    title: "Text Recognition (OCR)",
    description: "Extract searchable text from images and scanned documents.",
    tips: [
      "Works with photos, PDFs, and scanned documents",
      "Extracted text becomes searchable",
      "Processing happens automatically after upload"
    ]
  }
};

export default function SmartHelpTooltip({ 
  helpKey, 
  side = "top", 
  children, 
  showIcon = true,
  variant = "default",
  className = ""
}: SmartHelpTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const content = helpContent[helpKey];

  if (!content) {
    console.warn(`Help content not found for key: ${helpKey}`);
    return <>{children}</>;
  }

  const TooltipContentComponent = () => (
    <TooltipContent 
      side={side} 
      className={`max-w-sm p-0 bg-white border shadow-lg ${variant === 'detailed' ? 'max-w-md' : ''}`}
      sideOffset={8}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-blue-500" />
            <h4 className="font-semibold text-sm text-gray-900">{content.title}</h4>
          </div>
          {variant === 'detailed' && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* Description */}
        <p className="text-xs text-gray-600 mb-3 leading-relaxed">
          {content.description}
        </p>

        {/* Tips */}
        {content.tips && content.tips.length > 0 && (
          <div className="mb-3">
            <h5 className="text-xs font-medium text-gray-700 mb-1">Quick Tips:</h5>
            <ul className="space-y-1">
              {content.tips.map((tip, index) => (
                <li key={index} className="text-xs text-gray-600 flex items-start gap-1">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        {content.actions && content.actions.length > 0 && variant === 'detailed' && (
          <div className="mb-3">
            <h5 className="text-xs font-medium text-gray-700 mb-2">Available Actions:</h5>
            <div className="space-y-2">
              {content.actions.map((action, index) => {
                const IconComponent = action.icon || Target;
                return (
                  <div key={index} className="flex items-start gap-2">
                    <IconComponent className="h-3 w-3 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="text-xs font-medium text-gray-700">{action.label}</span>
                      <p className="text-xs text-gray-500">{action.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Learn More */}
        {content.learnMore && (
          <div className="pt-2 border-t border-gray-100">
            <Button
              variant="link"
              size="sm"
              className="text-xs text-blue-600 hover:text-blue-700 p-0 h-auto"
              onClick={() => {
                if (content.learnMore?.url) {
                  window.open(content.learnMore.url, '_blank');
                }
              }}
            >
              {content.learnMore.text} →
            </Button>
          </div>
        )}
      </div>
    </TooltipContent>
  );

  if (children) {
    return (
      <TooltipProvider>
        <Tooltip open={isOpen} onOpenChange={setIsOpen}>
          <TooltipTrigger asChild>
            <div className={`cursor-help ${className}`}>
              {children}
            </div>
          </TooltipTrigger>
          <TooltipContentComponent />
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip open={isOpen} onOpenChange={setIsOpen}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={`h-6 w-6 p-0 text-gray-400 hover:text-gray-600 cursor-help ${className}`}
          >
            <HelpCircle className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContentComponent />
      </Tooltip>
    </TooltipProvider>
  );
}

// Helper component for inline help badges
export function HelpBadge({ helpKey, text }: { helpKey: string; text: string }) {
  return (
    <SmartHelpTooltip helpKey={helpKey} variant="compact">
      <Badge variant="secondary" className="text-xs cursor-help">
        {text}
        <HelpCircle className="h-3 w-3 ml-1" />
      </Badge>
    </SmartHelpTooltip>
  );
}

// Helper component for section headers with help
export function HelpSection({ 
  title, 
  helpKey, 
  children, 
  className = "" 
}: { 
  title: string; 
  helpKey: string; 
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <SmartHelpTooltip helpKey={helpKey} variant="detailed" />
      </div>
      {children}
    </div>
  );
}