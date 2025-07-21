import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Share2, Trash2, Mail, Eye, Edit, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { DocumentShare } from "@shared/schema";

interface ShareDocumentDialogProps {
  documentId: number;
  documentName: string;
}

export function ShareDocumentDialog({ documentId, documentName }: ShareDocumentDialogProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [permissions, setPermissions] = useState<"view" | "edit">("view");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get existing shares
  const { data: shares = [], isLoading: sharesLoading } = useQuery<DocumentShare[]>({
    queryKey: ["/api/documents", documentId, "shares"],
    enabled: open,
  });

  // Share document mutation
  const shareMutation = useMutation({
    mutationFn: async ({ email, permissions }: { email: string; permissions: "view" | "edit" }) => {
      const response = await apiRequest("POST", `/api/documents/${documentId}/share`, {
        email,
        permissions,
      });
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Document shared",
        description: `Successfully shared "${documentName}" with ${email}`,
      });
      setEmail("");
      setPermissions("view");
      queryClient.invalidateQueries({ queryKey: ["/api/documents", documentId, "shares"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/login";
        }, 500);
        return;
      }
      toast({
        title: "Share failed",
        description: error.message || "Failed to share document",
        variant: "destructive",
      });
    },
  });

  // Unshare document mutation
  const unshareMutation = useMutation({
    mutationFn: async (shareId: number) => {
      return await apiRequest("DELETE", `/api/document-shares/${shareId}`);
    },
    onSuccess: () => {
      toast({
        title: "Access revoked",
        description: "Document access has been revoked successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/documents", documentId, "shares"] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/login";
        }, 500);
        return;
      }
      toast({
        title: "Failed to revoke access",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleShare = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    
    shareMutation.mutate({ email: email.trim(), permissions });
  };

  const handleUnshare = (shareId: number) => {
    if (confirm("Are you sure you want to revoke access for this user?")) {
      unshareMutation.mutate(shareId);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Share2 className="h-4 w-4 mr-2" />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Share "{documentName}"
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Share form */}
          <form onSubmit={handleShare} className="space-y-3">
            <div>
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email address"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="permissions">Permissions</Label>
              <Select value={permissions} onValueChange={(value: "view" | "edit") => setPermissions(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">
                    <div className="flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      Can view
                    </div>
                  </SelectItem>
                  <SelectItem value="edit">
                    <div className="flex items-center gap-2">
                      <Edit className="h-4 w-4" />
                      Can edit
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <Button 
              type="submit" 
              className="w-full" 
              disabled={shareMutation.isPending || !email.trim()}
            >
              {shareMutation.isPending ? "Sharing..." : "Share Document"}
            </Button>
          </form>

          {/* Existing shares */}
          <div>
            <h4 className="text-sm font-medium mb-2">People with access</h4>
            
            {sharesLoading ? (
              <div className="text-sm text-gray-500">Loading shares...</div>
            ) : shares.length === 0 ? (
              <div className="text-sm text-gray-500">No one else has access to this document</div>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {shares.map((share: DocumentShare) => (
                  <Card key={share.id} className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Mail className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{share.sharedWithEmail}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-xs">
                              {share.permissions === "view" ? (
                                <><Eye className="h-3 w-3 mr-1" />Can view</>
                              ) : (
                                <><Edit className="h-3 w-3 mr-1" />Can edit</>
                              )}
                            </Badge>
                            <span className="text-xs text-gray-500">
                              Shared {formatDate(share.sharedAt?.toString() || "")}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUnshare(share.id)}
                        disabled={unshareMutation.isPending}
                        className="text-red-600 hover:text-red-700 h-8 w-8 p-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}