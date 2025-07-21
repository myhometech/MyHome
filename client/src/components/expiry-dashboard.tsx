import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Calendar, Clock, FileText, ChevronRight } from "lucide-react";
import { DocumentPreview } from "./document-preview";

interface ExpiringDocument {
  id: number;
  name: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  extractedText: string | null;
  summary: string | null;
  uploadedAt: string;
  expiryDate: string;
  categoryName?: string;
  daysUntilExpiry: number;
}

interface ExpiryStats {
  expired: ExpiringDocument[];
  expiringSoon: ExpiringDocument[];
  expiringThisMonth: ExpiringDocument[];
}

import { useLocation } from "wouter";
import { useState } from "react";

interface ExpiryDashboardProps {
  onExpiryFilterChange?: (filter: 'expired' | 'expiring-soon' | 'this-month' | null) => void;
}

export function ExpiryDashboard({ onExpiryFilterChange }: ExpiryDashboardProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [selectedDocument, setSelectedDocument] = useState<ExpiringDocument | null>(null);
  
  const { data: expiryData, isLoading, error } = useQuery({
    queryKey: ["/api/documents/expiry-alerts"],
    retry: false,
    enabled: isAuthenticated, // Only run query when user is authenticated
  });

  // Don't show anything if user is not authenticated
  if (authLoading) {
    return null; // Auth is still loading
  }
  
  if (!isAuthenticated) {
    return null; // User is not logged in
  }

  // Handle errors manually since onError is deprecated in v5
  if (error) {
    if (isUnauthorizedError(error as Error)) {
      // Silently handle auth errors - user is not logged in
      return null;
    } else {
      console.error("Error loading expiry data:", error);
    }
  }

  if (isLoading) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Document Expiry Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-6">
            <div className="animate-pulse">Loading expiry data...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show error state if needed (but not for auth errors)
  if (error && !isUnauthorizedError(error as Error)) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            Error Loading Expiry Data
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            Unable to load document expiry information. Please try refreshing the page.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Type guard for expiry data
  const typedExpiryData = expiryData as ExpiryStats | undefined;

  // Always show dashboard, even with empty data
  const hasAnyExpiryData = typedExpiryData && (typedExpiryData.expired.length > 0 || typedExpiryData.expiringSoon.length > 0 || typedExpiryData.expiringThisMonth.length > 0);

  const hasAlerts = typedExpiryData && (typedExpiryData.expired.length > 0 || typedExpiryData.expiringSoon.length > 0);

  const getExpiryDescription = (document: ExpiringDocument) => {
    const daysUntil = document.daysUntilExpiry;
    const docName = document.name;
    
    if (daysUntil < 0) {
      const daysOverdue = Math.abs(daysUntil);
      if (daysOverdue === 1) {
        return `${docName} expired yesterday`;
      } else if (daysOverdue <= 7) {
        return `${docName} expired ${daysOverdue} days ago`;
      } else {
        return `${docName} expired ${Math.floor(daysOverdue / 7)} week${Math.floor(daysOverdue / 7) > 1 ? 's' : ''} ago`;
      }
    } else if (daysUntil === 0) {
      return `${docName} expires today`;
    } else if (daysUntil === 1) {
      return `${docName} expires tomorrow`;
    } else if (daysUntil <= 7) {
      return `${docName} expires in ${daysUntil} days`;
    } else {
      const weeksUntil = Math.floor(daysUntil / 7);
      return `${docName} expires in ${weeksUntil} week${weeksUntil > 1 ? 's' : ''}`;
    }
  };

  const getCategoryInfo = (document: ExpiringDocument) => {
    // Fetch categories to match with document
    return document.categoryName || 'Document';
  };

  const handleDocumentClick = (document: ExpiringDocument) => {
    setSelectedDocument(document);
  };

  const handleDownload = (document: ExpiringDocument) => {
    window.open(`/api/documents/${document.id}/download`, '_blank');
  };

  return (
    <div className="space-y-6 mb-6">
      {/* Critical Alerts with Detailed Descriptions */}
      {hasAlerts && typedExpiryData && (
        <div className="space-y-3">
          {/* Expired Documents */}
          {typedExpiryData.expired.length > 0 && (
            <Alert className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertTitle className="text-red-800 mb-3">
                Expired Documents - Immediate Action Required
              </AlertTitle>
              <AlertDescription className="text-red-700">
                <div className="space-y-2">
                  {typedExpiryData.expired.slice(0, 3).map((doc) => (
                    <div 
                      key={doc.id}
                      onClick={() => handleDocumentClick(doc)}
                      className="flex items-center justify-between p-2 bg-white bg-opacity-50 rounded hover:bg-opacity-75 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        <span className="font-medium">{getExpiryDescription(doc)}</span>
                      </div>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  ))}
                  {typedExpiryData.expired.length > 3 && (
                    <div 
                      onClick={() => setLocation('/expiry-documents?filter=expired')}
                      className="text-sm underline cursor-pointer hover:text-red-900"
                    >
                      View all {typedExpiryData.expired.length} expired documents →
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Expiring Soon Documents */}
          {typedExpiryData.expiringSoon.length > 0 && (
            <Alert className="border-orange-200 bg-orange-50">
              <Clock className="h-4 w-4 text-orange-600" />
              <AlertTitle className="text-orange-800 mb-3">
                Documents Expiring Soon
              </AlertTitle>
              <AlertDescription className="text-orange-700">
                <div className="space-y-2">
                  {typedExpiryData.expiringSoon.slice(0, 3).map((doc) => (
                    <div 
                      key={doc.id}
                      onClick={() => handleDocumentClick(doc)}
                      className="flex items-center justify-between p-2 bg-white bg-opacity-50 rounded hover:bg-opacity-75 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        <span className="font-medium">{getExpiryDescription(doc)}</span>
                      </div>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  ))}
                  {typedExpiryData.expiringSoon.length > 3 && (
                    <div 
                      onClick={() => setLocation('/expiry-documents?filter=expiring-soon')}
                      className="text-sm underline cursor-pointer hover:text-orange-900"
                    >
                      View all {typedExpiryData.expiringSoon.length} expiring soon →
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Dashboard Cards */}
      {!hasAnyExpiryData ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Document Expiry Dashboard
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-6">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Expiry Dates Set</h3>
              <p className="text-gray-500">
                Add expiry dates to your documents to track important deadlines and get alerts when they're due for renewal.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Expired Documents */}
          <Card 
            className="border-red-200 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setLocation('/expiry-documents?filter=expired')}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-red-700 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Expired
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {typedExpiryData?.expired?.length || 0}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Documents past expiry
              </p>
              {(typedExpiryData?.expired?.length || 0) > 0 && (
                <p className="text-xs text-red-600 mt-2 font-medium">
                  Click to view →
                </p>
              )}
            </CardContent>
          </Card>

          {/* Expiring Soon */}
          <Card 
            className="border-orange-200 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setLocation('/expiry-documents?filter=expiring-soon')}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-orange-700 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Expiring Soon
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {typedExpiryData?.expiringSoon?.length || 0}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Within 7 days
              </p>
              {(typedExpiryData?.expiringSoon?.length || 0) > 0 && (
                <p className="text-xs text-orange-600 mt-2 font-medium">
                  Click to view →
                </p>
              )}
            </CardContent>
          </Card>

          {/* This Month */}
          <Card 
            className="border-yellow-200 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setLocation('/expiry-documents?filter=this-month')}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-yellow-700 flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                This Month
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                {typedExpiryData?.expiringThisMonth?.length || 0}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Expiring this month
              </p>
              {(typedExpiryData?.expiringThisMonth?.length || 0) > 0 && (
                <p className="text-xs text-yellow-600 mt-2 font-medium">
                  Click to view →
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Document Preview Modal */}
      {selectedDocument && (
        <DocumentPreview
          document={selectedDocument}
          category={{
            name: getCategoryInfo(selectedDocument),
            icon: 'fas fa-file-alt',
            color: 'blue'
          }}
          onClose={() => setSelectedDocument(null)}
          onDownload={() => handleDownload(selectedDocument)}
        />
      )}
    </div>
  );
}