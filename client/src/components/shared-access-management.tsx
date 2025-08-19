import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Users, UserPlus, Mail, Trash2, Crown, Shield, Eye, RefreshCw, Send } from "lucide-react";
import { isUnauthorizedError } from "@/lib/authUtils";

// Types for household management
interface HouseholdMember {
  id: string;
  userId: string;
  householdId: string;
  role: 'owner' | 'duo_partner' | 'household_user';
  joinedAt: string;
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
}

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  invitedAt: string;
  status: 'pending' | 'expired';
}

interface HouseholdDetails {
  id: string;
  planType: string;
  seatLimit: number;
  memberCount: number;
  members: HouseholdMember[];
}

export default function SharedAccessManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<'duo_partner' | 'household_user'>('household_user');
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null);

  // Check if user has Duo subscription
  const isDuoUser = (user as any)?.subscriptionTier === 'duo';

  // TICKET 3: Get user role and household members with real API calls
  const { data: userRole } = useQuery({
    queryKey: ['/api/user/role'],
    enabled: isDuoUser,
  });

  const { data: members = [], isLoading: membersLoading } = useQuery<HouseholdMember[]>({
    queryKey: ['/api/household/members'],
    enabled: isDuoUser && !!userRole?.household,
  });

  // Get pending invites
  const { data: pendingInvites = [] } = useQuery<PendingInvite[]>({
    queryKey: ['/api/household/invites'],
    enabled: isDuoUser && !!userRole?.household,
  });

  // Invite member mutation (UI only)
  const inviteMutation = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      const response = await apiRequest("POST", "/api/household/invite", {
        email,
        role
      });
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Invitation sent",
        description: data.type === 'existing_user_added' 
          ? `${inviteEmail} has been added to your household`
          : `Invitation sent to ${inviteEmail}`,
      });
      setInviteEmail("");
      setInviteRole('household_user');
      queryClient.invalidateQueries({ queryKey: ['/api/household/details'] });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "Please log in again to continue",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Invitation failed",
        description: error.message || "Failed to send invitation",
        variant: "destructive",
      });
    },
  });

  // Remove member mutation
  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const response = await apiRequest("DELETE", `/api/household/members/${memberId}`);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Member removed",
        description: "The member has been removed from your household",
      });
      setMemberToRemove(null);
      queryClient.invalidateQueries({ queryKey: ['/api/household/details'] });
    },
    onError: (error) => {
      toast({
        title: "Remove failed",
        description: error.message || "Failed to remove member",
        variant: "destructive",
      });
    },
  });

  // Resend invite function (placeholder)
  const handleResendInvite = (email: string) => {
    toast({
      title: "Invite resent",
      description: `Invitation resent to ${email}`,
    });
  };

  // Remove invite function (placeholder)
  const handleRemoveInvite = (email: string) => {
    toast({
      title: "Invite removed",
      description: `Invitation to ${email} has been cancelled`,
    });
  };

  // Role display helpers
  const getRoleDisplay = (role: string) => {
    switch (role) {
      case 'owner':
        return { label: 'Owner', variant: 'default' as const, icon: Crown };
      case 'duo_partner':
        return { label: 'Duo Partner', variant: 'secondary' as const, icon: Shield };
      case 'household_user':
        return { label: 'Household User', variant: 'outline' as const, icon: Eye };
      default:
        return { label: role, variant: 'outline' as const, icon: Users };
    }
  };

  const getRoleDescription = (role: string) => {
    switch (role) {
      case 'owner':
        return 'Full access to account settings, billing, and member management';
      case 'duo_partner':
        return 'Full access to documents and features, no billing access';
      case 'household_user':
        return 'Can view and upload documents, limited access to settings';
      default:
        return 'Member of the household';
    }
  };

  if (!isDuoUser) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Shared Access
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Upgrade to Duo Plan</h3>
            <p className="text-gray-600 mb-4">
              Share your documents with family members or partners with the Duo plan.
            </p>
            <Button>Upgrade to Duo</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (householdLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Shared Access
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // TICKET 3: Use real user role data
  const currentUserRole = userRole?.household?.role;
  const isOwner = currentUserRole === 'owner';
  const canInvite = userRole?.household?.permissions?.canInvite || false;
  const canRemove = userRole?.household?.permissions?.canRemoveMembers || false;

  return (
    <div className="space-y-6">
      {/* Household Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Shared Access
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{members.length}</div>
              <div className="text-sm text-gray-600">Active Members</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">2</div>
              <div className="text-sm text-gray-600">Total Seats</div>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">{pendingInvites.length}</div>
              <div className="text-sm text-gray-600">Pending Invites</div>
            </div>
          </div>

          {/* Invite New Member */}
          {canInvite && (
            <div className="border rounded-lg p-4 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <UserPlus className="h-4 w-4" />
                <h3 className="font-medium">Invite New Member</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-1">
                  <Label htmlFor="invite-email">Email Address</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder="member@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="invite-role">Role</Label>
                  <Select value={inviteRole} onValueChange={(value: 'duo_partner' | 'household_user') => setInviteRole(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="household_user">Household User</SelectItem>
                      <SelectItem value="duo_partner">Duo Partner</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button 
                    onClick={() => inviteMutation.mutate({ email: inviteEmail, role: inviteRole })}
                    disabled={!inviteEmail.trim() || inviteMutation.isPending}
                    className="w-full"
                  >
                    {inviteMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Send Invite
                  </Button>
                </div>
              </div>
              <p className="text-xs text-gray-600 mt-2">
                {getRoleDescription(inviteRole)}
              </p>
            </div>
          )}

          {/* Current Members */}
          <div>
            <h3 className="font-medium mb-3">Current Members</h3>
            <div className="space-y-3">
              {members.map((member) => {
                const roleDisplay = getRoleDisplay(member.role);
                const IconComponent = roleDisplay.icon;
                const isCurrentUser = member.userId === (user as any)?.id;
                
                return (
                  <div key={member.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                        {member.user.firstName 
                          ? member.user.firstName[0].toUpperCase()
                          : member.user.email[0].toUpperCase()
                        }
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {member.user.firstName && member.user.lastName 
                              ? `${member.user.firstName} ${member.user.lastName}`
                              : member.user.email
                            }
                          </span>
                          {isCurrentUser && (
                            <Badge variant="outline" className="text-xs">You</Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">{member.user.email}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Badge variant={roleDisplay.variant} className="flex items-center gap-1">
                        <IconComponent className="h-3 w-3" />
                        {roleDisplay.label}
                      </Badge>
                      
                      {canRemove && !isCurrentUser && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setMemberToRemove(member.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove Member</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to remove {member.user.firstName || member.user.email} from your household? 
                                They will lose access to all shared documents and data.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel onClick={() => setMemberToRemove(null)}>
                                Cancel
                              </AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={() => removeMemberMutation.mutate(member.id)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Remove Member
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pending Invites */}
          {pendingInvites.length > 0 && (
            <div className="mt-6">
              <h3 className="font-medium mb-3">Pending Invitations</h3>
              <div className="space-y-3">
                {pendingInvites.map((invite) => (
                  <div key={invite.id} className="flex items-center justify-between p-3 border rounded-lg bg-yellow-50">
                    <div className="flex items-center gap-3">
                      <Mail className="h-5 w-5 text-yellow-600" />
                      <div>
                        <div className="font-medium">{invite.email}</div>
                        <div className="text-sm text-gray-600">
                          Invited as {getRoleDisplay(invite.role).label} • {new Date(invite.invitedAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-yellow-700 border-yellow-300">
                        Pending
                      </Badge>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleResendInvite(invite.email)}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleRemoveInvite(invite.email)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}