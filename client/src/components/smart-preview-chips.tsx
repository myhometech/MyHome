import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, DollarSign, Clock, AlertTriangle, FileText, User, MapPin, Phone, Mail } from "lucide-react";

interface SmartPreviewChipsProps {
  document: {
    id: number;
    extractedText: string | null;
    summary: string | null;
    mimeType: string;
    fileName: string;
  };
}

interface PreviewChip {
  type: 'date' | 'amount' | 'person' | 'location' | 'contact' | 'document_type' | 'urgency' | 'reference';
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  confidence: number;
}

export function SmartPreviewChips({ document }: SmartPreviewChipsProps) {
  const [chips, setChips] = useState<PreviewChip[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (document.extractedText || document.summary) {
      generatePreviewChips();
    }
  }, [document]);

  const generatePreviewChips = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/documents/analyze-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          documentId: document.id,
          extractedText: document.extractedText,
          summary: document.summary,
          fileName: document.fileName,
          mimeType: document.mimeType
        }),
      });

      if (response.ok) {
        const analysisResult = await response.json();
        const generatedChips = createChipsFromAnalysis(analysisResult);
        setChips(generatedChips);
      } else {
        // Fallback to local analysis if API fails
        const localChips = createChipsFromLocalAnalysis();
        setChips(localChips);
      }
    } catch (error) {
      console.error('Error generating preview chips:', error);
      // Fallback to local analysis
      const localChips = createChipsFromLocalAnalysis();
      setChips(localChips);
    } finally {
      setIsLoading(false);
    }
  };

  const createChipsFromAnalysis = (analysis: any): PreviewChip[] => {
    const chips: PreviewChip[] = [];

    // Add AI-extracted entities
    if (analysis.entities) {
      analysis.entities.forEach((entity: any) => {
        chips.push({
          type: entity.type,
          label: entity.label,
          value: entity.value,
          icon: getIconForType(entity.type),
          color: getColorForType(entity.type),
          confidence: entity.confidence || 0.8
        });
      });
    }

    // Add document insights
    if (analysis.insights) {
      analysis.insights.forEach((insight: any) => {
        chips.push({
          type: insight.type,
          label: insight.label,
          value: insight.value,
          icon: getIconForType(insight.type),
          color: getColorForType(insight.type),
          confidence: insight.confidence || 0.7
        });
      });
    }

    return chips.slice(0, 6); // Limit to 6 chips for UI
  };

  const createChipsFromLocalAnalysis = (): PreviewChip[] => {
    const chips: PreviewChip[] = [];
    const text = document.extractedText || document.summary || '';

    // Extract dates
    const dateRegex = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})|(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})|(\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b)/gi;
    const dates = text.match(dateRegex);
    if (dates && dates.length > 0) {
      chips.push({
        type: 'date',
        label: 'Important Date',
        value: dates[0],
        icon: <Calendar className="w-3 h-3" />,
        color: 'blue',
        confidence: 0.9
      });
    }

    // Extract amounts
    const amountRegex = /[\$£€¥₹]\s*[\d,]+\.?\d*|\b\d+\.?\d*\s*(?:USD|GBP|EUR|dollars?|pounds?|euros?)\b/gi;
    const amounts = text.match(amountRegex);
    if (amounts && amounts.length > 0) {
      chips.push({
        type: 'amount',
        label: 'Amount',
        value: amounts[0],
        icon: <DollarSign className="w-3 h-3" />,
        color: 'green',
        confidence: 0.8
      });
    }

    // Extract phone numbers
    const phoneRegex = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b|\b\(\d{3}\)\s*\d{3}[-.]?\d{4}\b/g;
    const phones = text.match(phoneRegex);
    if (phones && phones.length > 0) {
      chips.push({
        type: 'contact',
        label: 'Phone',
        value: phones[0],
        icon: <Phone className="w-3 h-3" />,
        color: 'purple',
        confidence: 0.7
      });
    }

    // Extract emails
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emails = text.match(emailRegex);
    if (emails && emails.length > 0) {
      chips.push({
        type: 'contact',
        label: 'Email',
        value: emails[0],
        icon: <Mail className="w-3 h-3" />,
        color: 'purple',
        confidence: 0.8
      });
    }

    // Detect document type from filename and content
    const docType = detectDocumentType(document.fileName, text);
    if (docType) {
      chips.push({
        type: 'document_type',
        label: 'Document Type',
        value: docType,
        icon: <FileText className="w-3 h-3" />,
        color: 'gray',
        confidence: 0.9
      });
    }

    // Detect urgency keywords
    const urgencyKeywords = /\b(?:urgent|asap|immediate|deadline|due|expires?|overdue|final notice)\b/gi;
    if (urgencyKeywords.test(text)) {
      chips.push({
        type: 'urgency',
        label: 'Priority',
        value: 'High Priority',
        icon: <AlertTriangle className="w-3 h-3" />,
        color: 'red',
        confidence: 0.7
      });
    }

    return chips.slice(0, 6);
  };

  const detectDocumentType = (fileName: string, text: string): string | null => {
    const lowerFileName = fileName.toLowerCase();
    const lowerText = text.toLowerCase();

    if (lowerFileName.includes('invoice') || lowerText.includes('invoice')) return 'Invoice';
    if (lowerFileName.includes('receipt') || lowerText.includes('receipt')) return 'Receipt';
    if (lowerFileName.includes('contract') || lowerText.includes('contract')) return 'Contract';
    if (lowerFileName.includes('policy') || lowerText.includes('insurance')) return 'Insurance Policy';
    if (lowerFileName.includes('bill') || lowerText.includes('bill')) return 'Bill';
    if (lowerFileName.includes('statement') || lowerText.includes('statement')) return 'Statement';
    if (lowerFileName.includes('boarding') || lowerText.includes('boarding pass')) return 'Boarding Pass';
    if (lowerFileName.includes('ticket') || lowerText.includes('ticket')) return 'Ticket';
    
    return null;
  };

  const getIconForType = (type: string): React.ReactNode => {
    switch (type) {
      case 'date': return <Calendar className="w-3 h-3" />;
      case 'amount': return <DollarSign className="w-3 h-3" />;
      case 'person': return <User className="w-3 h-3" />;
      case 'location': return <MapPin className="w-3 h-3" />;
      case 'contact': return <Phone className="w-3 h-3" />;
      case 'document_type': return <FileText className="w-3 h-3" />;
      case 'urgency': return <AlertTriangle className="w-3 h-3" />;
      case 'reference': return <Clock className="w-3 h-3" />;
      default: return <FileText className="w-3 h-3" />;
    }
  };

  const getColorForType = (type: string): string => {
    switch (type) {
      case 'date': return 'blue';
      case 'amount': return 'green';
      case 'person': return 'purple';
      case 'location': return 'orange';
      case 'contact': return 'purple';
      case 'document_type': return 'gray';
      case 'urgency': return 'red';
      case 'reference': return 'blue';
      default: return 'gray';
    }
  };

  const getBadgeVariant = (color: string) => {
    switch (color) {
      case 'blue': return 'default';
      case 'green': return 'default';
      case 'red': return 'destructive';
      case 'purple': return 'secondary';
      case 'orange': return 'secondary';
      case 'gray': return 'outline';
      default: return 'secondary';
    }
  };

  if (!document.extractedText && !document.summary) {
    return null;
  }

  return (
    <Card>
      <CardContent className="p-3">
        <h3 className="font-semibold mb-2 text-sm">Smart Insights</h3>
        
        {isLoading ? (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs text-gray-600">Analyzing content...</span>
          </div>
        ) : chips.length > 0 ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              {chips.map((chip, index) => (
                <Badge
                  key={index}
                  variant={getBadgeVariant(chip.color)}
                  className="text-xs flex items-center gap-1 px-2 py-1"
                >
                  {chip.icon}
                  <span className="font-medium">{chip.label}:</span>
                  <span className="truncate max-w-20">{chip.value}</span>
                </Badge>
              ))}
            </div>
            
            {chips.some(chip => chip.confidence < 0.8) && (
              <p className="text-xs text-gray-500 mt-2">
                AI-powered analysis • Some results may need verification
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-500">No key insights detected</p>
        )}
      </CardContent>
    </Card>
  );
}