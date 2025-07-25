import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  ChevronDown, 
  ChevronRight, 
  FileText, 
  Calendar, 
  Search, 
  Sparkles, 
  Eye,
  Copy,
  AlertTriangle,
  CheckCircle,
  Clock
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Document {
  id: number;
  name: string;
  fileName: string;
  extractedText: string | null;
  summary: string | null;
  ocrProcessed: boolean | null;
  expiryDate: string | null;
  tags: string[] | null;
  uploadedAt: string;
  mimeType: string;
}

interface OCRSummaryPreviewProps {
  document: Document;
  className?: string;
  hideExtractedText?: boolean;
}

export default function OCRSummaryPreview({ document, className = "", hideExtractedText = false }: OCRSummaryPreviewProps) {
  const { toast } = useToast();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    summary: true,
    extractedText: false,
    insights: false,
    metadata: false
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied to clipboard",
        description: `${label} has been copied to your clipboard.`,
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Unable to copy to clipboard. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getProcessingStatus = () => {
    if (!document.ocrProcessed) {
      return {
        icon: <Clock className="h-4 w-4 text-yellow-500" />,
        text: "Processing...",
        variant: "secondary" as const
      };
    }
    
    if (document.extractedText && !document.extractedText.includes("failed")) {
      return {
        icon: <CheckCircle className="h-4 w-4 text-green-500" />,
        text: "Processed",
        variant: "secondary" as const
      };
    }
    
    return {
      icon: <AlertTriangle className="h-4 w-4 text-orange-500" />,
      text: "Processing Issues",
      variant: "destructive" as const
    };
  };

  const extractInsights = () => {
    const insights = [];
    
    // Check for dates
    if (document.expiryDate) {
      const expiryDate = new Date(document.expiryDate);
      const today = new Date();
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      insights.push({
        type: "expiry",
        icon: <Calendar className="h-4 w-4 text-blue-500" />,
        title: "Expiry Date Detected",
        content: `Document expires on ${expiryDate.toLocaleDateString()}`,
        detail: daysUntilExpiry > 0 ? `${daysUntilExpiry} days remaining` : "Expired",
        urgent: daysUntilExpiry <= 30
      });
    }
    
    // Check for important keywords
    const text = document.extractedText?.toLowerCase() || "";
    const importantKeywords = ["bill", "invoice", "payment", "due", "contract", "insurance", "medical", "tax", "receipt"];
    const foundKeywords = importantKeywords.filter(keyword => text.includes(keyword));
    
    if (foundKeywords.length > 0) {
      insights.push({
        type: "keywords",
        icon: <Search className="h-4 w-4 text-purple-500" />,
        title: "Document Type Detected",
        content: `Likely ${foundKeywords[0]} document`,
        detail: `Contains: ${foundKeywords.slice(0, 3).join(", ")}`,
        urgent: false
      });
    }
    
    // Check text length and quality
    if (document.extractedText && document.extractedText.length > 100) {
      insights.push({
        type: "quality",
        icon: <Eye className="h-4 w-4 text-green-500" />,
        title: "Text Quality",
        content: "High quality text extraction",
        detail: `${document.extractedText.length} characters extracted`,
        urgent: false
      });
    }
    
    return insights;
  };

  const status = getProcessingStatus();
  const insights = extractInsights();
  const hasContent = document.summary || document.extractedText;

  if (!hasContent && !document.ocrProcessed) {
    return (
      <Card className={`${className} border-dashed`}>
        <CardContent className="py-6">
          <div className="text-center text-gray-500">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Document processing will begin shortly...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-500" />
            AI Document Insights
          </CardTitle>
          <Badge variant={status.variant} className="flex items-center gap-1">
            {status.icon}
            {status.text}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Summary Section */}
        <Collapsible open={expandedSections.summary} onOpenChange={() => toggleSection("summary")}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between p-0 h-auto">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-blue-500" />
                <span className="font-medium">AI Summary</span>
              </div>
              {expandedSections.summary ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4">
              <p className="text-sm leading-relaxed">
                {document.summary || "Summary not available - document processing may have encountered issues."}
              </p>
              {document.summary && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-8"
                  onClick={() => copyToClipboard(document.summary!, "Summary")}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copy
                </Button>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Insights Section */}
        {insights.length > 0 && (
          <Collapsible open={expandedSections.insights} onOpenChange={() => toggleSection("insights")}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-0 h-auto">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-purple-500" />
                  <span className="font-medium">Document Insights</span>
                  <Badge variant="secondary" className="text-xs">
                    {insights.length}
                  </Badge>
                </div>
                {expandedSections.insights ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              <div className="space-y-3">
                {insights.map((insight, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border-l-4 ${
                      insight.urgent 
                        ? "bg-orange-50 dark:bg-orange-950/20 border-l-orange-500" 
                        : "bg-gray-50 dark:bg-gray-950/20 border-l-gray-300"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {insight.icon}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{insight.title}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{insight.content}</p>
                        {insight.detail && (
                          <p className="text-xs text-gray-500 mt-1">{insight.detail}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Extracted Text Section - Hidden in modal to reduce clutter */}
        {document.extractedText && !hideExtractedText && (
          <Collapsible open={expandedSections.extractedText} onOpenChange={() => toggleSection("extractedText")}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-0 h-auto">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-green-500" />
                  <span className="font-medium">Extracted Text</span>
                  <Badge variant="outline" className="text-xs">
                    {document.extractedText.length} chars
                  </Badge>
                </div>
                {expandedSections.extractedText ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              <div className="bg-gray-50 dark:bg-gray-950/50 rounded-lg p-4 max-h-64 overflow-y-auto">
                <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed">
                  {document.extractedText}
                </pre>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3 h-8"
                  onClick={() => copyToClipboard(document.extractedText!, "Extracted text")}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copy Text
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Metadata Section */}
        <Collapsible open={expandedSections.metadata} onOpenChange={() => toggleSection("metadata")}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between p-0 h-auto">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-gray-500" />
                <span className="font-medium">Processing Details</span>
              </div>
              {expandedSections.metadata ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500">File Type:</span>
                <p className="font-mono">{document.mimeType}</p>
              </div>
              <div>
                <span className="text-gray-500">Processed:</span>
                <p>{document.ocrProcessed ? "Yes" : "No"}</p>
              </div>
              <div>
                <span className="text-gray-500">Upload Date:</span>
                <p>{new Date(document.uploadedAt).toLocaleDateString()}</p>
              </div>

            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}