import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Calendar, Clock, FileText } from "lucide-react";

interface ExpiringDocument {
  id: number;
  name: string;
  expiryDate: string;
  categoryName?: string;
  daysUntilExpiry: number;
}

interface ExpiryStats {
  expired: ExpiringDocument[];
  expiringSoon: ExpiringDocument[];
  expiringThisMonth: ExpiringDocument[];
}

export function ExpiryDashboard() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  
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

  // Hide dashboard if no expiry data
  if (!typedExpiryData || (typedExpiryData.expired.length === 0 && typedExpiryData.expiringSoon.length === 0 && typedExpiryData.expiringThisMonth.length === 0)) {
    return null;
  }

  const hasAlerts = typedExpiryData.expired.length > 0 || typedExpiryData.expiringSoon.length > 0;

  return (
    <div className="space-y-6 mb-6">
      {/* Critical Alerts */}
      {hasAlerts && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800">
            Attention Required
          </AlertTitle>
          <AlertDescription className="text-red-700">
            {typedExpiryData.expired.length > 0 && (
              <span>{typedExpiryData.expired.length} document(s) have expired. </span>
            )}
            {typedExpiryData.expiringSoon.length > 0 && (
              <span>{typedExpiryData.expiringSoon.length} document(s) expire within 7 days.</span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Dashboard Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Expired Documents */}
        <Card className="border-red-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-red-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Expired
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {typedExpiryData.expired.length}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Documents past expiry
            </p>
          </CardContent>
        </Card>

        {/* Expiring Soon */}
        <Card className="border-orange-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-orange-700 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Expiring Soon
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {typedExpiryData.expiringSoon.length}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Within 7 days
            </p>
          </CardContent>
        </Card>

        {/* This Month */}
        <Card className="border-yellow-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-yellow-700 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {typedExpiryData.expiringThisMonth.length}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Expiring this month
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Lists */}
      {(typedExpiryData.expired.length > 0 || typedExpiryData.expiringSoon.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Expired Documents List */}
          {typedExpiryData.expired.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-red-700 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Expired Documents
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {typedExpiryData.expired.map((doc: ExpiringDocument) => (
                    <ExpiryDocumentItem key={doc.id} document={doc} variant="expired" />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Expiring Soon List */}
          {typedExpiryData.expiringSoon.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-orange-700 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Expiring Soon
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {typedExpiryData.expiringSoon.map((doc: ExpiringDocument) => (
                    <ExpiryDocumentItem key={doc.id} document={doc} variant="warning" />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

interface ExpiryDocumentItemProps {
  document: ExpiringDocument;
  variant: "expired" | "warning" | "info";
}

function ExpiryDocumentItem({ document, variant }: ExpiryDocumentItemProps) {
  const getBadgeVariant = () => {
    switch (variant) {
      case "expired":
        return "destructive";
      case "warning":
        return "secondary";
      case "info":
        return "outline";
    }
  };

  const getStatusText = () => {
    if (document.daysUntilExpiry < 0) {
      return `Expired ${Math.abs(document.daysUntilExpiry)} days ago`;
    } else if (document.daysUntilExpiry === 0) {
      return "Expires today";
    } else {
      return `Expires in ${document.daysUntilExpiry} days`;
    }
  };

  return (
    <div className="flex items-center justify-between p-3 rounded-lg border bg-white">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <FileText className="h-4 w-4 text-gray-500 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{document.name}</p>
          {document.categoryName && (
            <p className="text-sm text-gray-500">{document.categoryName}</p>
          )}
          <p className="text-xs text-gray-500">
            Expires: {new Date(document.expiryDate).toLocaleDateString()}
          </p>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <Badge variant={getBadgeVariant()} className="text-xs">
          {getStatusText()}
        </Badge>
      </div>
    </div>
  );
}