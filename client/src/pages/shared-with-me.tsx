import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Eye, Edit, Mail } from "lucide-react";
import DocumentCard from "@/components/document-card";
import { Navigation } from "@/components/navigation";
import type { Document } from "@shared/schema";

interface Category {
  id: number;
  name: string;
  icon: string;
  color: string;
}

export default function SharedWithMe() {
  const { data: sharedDocuments = [], isLoading } = useQuery<Document[]>({
    queryKey: ["/api/shared-with-me"],
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="container mx-auto py-8 px-4">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <Users className="h-6 w-6" />
              <h1 className="text-2xl font-bold">Shared with Me</h1>
            </div>
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-sm text-gray-500 mt-2">Loading shared documents...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <main className="container mx-auto py-8 px-4">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6" />
            <h1 className="text-2xl font-bold">Shared with Me</h1>
            <Badge variant="secondary" className="ml-auto">
              {sharedDocuments.length} document{sharedDocuments.length !== 1 ? 's' : ''}
            </Badge>
          </div>

      {sharedDocuments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <Mail className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium mb-2">No shared documents</h3>
            <p className="text-gray-500 text-center max-w-md">
              Documents that others share with you will appear here. Share your email address with family members so they can share documents with you.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sharedDocuments.map((document) => (
            <div key={document.id} className="relative">
              <DocumentCard
                document={document}
                categories={categories}
                viewMode="grid"
              />
              <div className="absolute top-2 right-2">
                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                  <Users className="h-3 w-3 mr-1" />
                  Shared
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      {sharedDocuments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Eye className="h-4 w-4" />
              About Shared Documents
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-gray-600 space-y-2">
            <p>• Documents shared with you appear with a "Shared" badge</p>
            <p>• You can view and download shared documents</p>
            <p>• Edit permissions depend on what the owner granted you</p>
            <p>• Contact the document owner to request changes to sharing permissions</p>
          </CardContent>
        </Card>
      )}
        </div>
      </main>
    </div>
  );
}