import { useEffect, useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, UserPlus, Home, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface InviteDetails {
  id: number;
  email: string;
  householdId: string;
  householdName: string;
  inviterName: string;
  inviterEmail: string;
  role: string;
  expiresAt: string;
}

export function InviteAccept() {
  const [, params] = useRoute('/invite/accept');
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Get token from URL params
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');

  useEffect(() => {
    if (!token) {
      setError('Invalid invite link - no token found');
      setLoading(false);
      return;
    }

    validateToken();
  }, [token]);

  const validateToken = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/invites/validate?token=${token}`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const invite = await response.json();
      setInvite(invite);
      setError(null);
    } catch (err: any) {
      console.error('Error validating invite token:', err);
      
      if (err.message.includes('404')) {
        setError('This invite link is invalid or has already been used.');
      } else if (err.message.includes('400')) {
        setError('This invite link has expired. Please contact the person who invited you for a new invitation.');
      } else {
        setError('Unable to validate invitation. Please try again or contact support.');
      }
    } finally {
      setLoading(false);
    }
  };

  const acceptInvite = async () => {
    if (!token || !invite) return;

    try {
      setAccepting(true);
      const response = await fetch('/api/invites/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      toast({
        title: "Welcome to the household!",
        description: `You've successfully joined ${invite.householdName}`,
      });

      // Redirect to home/dashboard after successful acceptance
      setTimeout(() => {
        setLocation('/');
      }, 1500);

    } catch (err: any) {
      console.error('Error accepting invite:', err);
      
      let errorMessage = 'Failed to accept invitation. Please try again.';
      if (err.message.includes('400')) {
        errorMessage = 'This invitation has expired or is no longer valid.';
      } else if (err.message.includes('409')) {
        errorMessage = 'You are already a member of this household.';
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setAccepting(false);
    }
  };

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'duo_partner': return 'Partner';
      case 'household_user': return 'Member';
      default: return 'Member';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8">
            <div className="flex items-center justify-center space-x-2">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              <span className="text-lg font-medium text-gray-700">Validating invitation...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-pink-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-red-200">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <CardTitle className="text-red-900">Invalid Invitation</CardTitle>
            <CardDescription className="text-red-700">{error}</CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col space-y-3">
            <Alert className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                Contact the person who sent you this invitation to request a new invite link.
              </AlertDescription>
            </Alert>
            <Button 
              onClick={() => setLocation('/')} 
              variant="outline" 
              className="w-full border-red-200 text-red-700 hover:bg-red-50"
            >
              Return Home
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-slate-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-8 text-center">
            <p className="text-gray-600">No invitation found.</p>
            <Button onClick={() => setLocation('/')} className="mt-4">
              Return Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-blue-200 shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
            <Home className="h-8 w-8 text-blue-600" />
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">Join Household</CardTitle>
          <CardDescription className="text-gray-600">
            You've been invited to join a shared household workspace
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-700">Household:</p>
              <p className="text-lg font-semibold text-blue-900">{invite.householdName}</p>
            </div>
            
            <div>
              <p className="text-sm font-medium text-gray-700">Invited by:</p>
              <p className="text-base text-gray-900">{invite.inviterName}</p>
              <p className="text-sm text-gray-600">{invite.inviterEmail}</p>
            </div>
            
            <div>
              <p className="text-sm font-medium text-gray-700">Your role:</p>
              <p className="text-base text-blue-800 font-medium">{getRoleDisplayName(invite.role)}</p>
            </div>
            
            <div>
              <p className="text-sm font-medium text-gray-700">Invitation expires:</p>
              <p className="text-sm text-gray-600">
                {new Date(invite.expiresAt).toLocaleDateString()} at {' '}
                {new Date(invite.expiresAt).toLocaleTimeString()}
              </p>
            </div>
          </div>

          <Alert className="border-blue-200 bg-blue-50">
            <UserPlus className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              By accepting this invitation, you'll be able to access and manage documents in this household.
            </AlertDescription>
          </Alert>
        </CardContent>
        
        <CardFooter className="flex space-x-3">
          <Button 
            onClick={() => setLocation('/')} 
            variant="outline" 
            className="flex-1"
            disabled={accepting}
          >
            Cancel
          </Button>
          <Button 
            onClick={acceptInvite} 
            disabled={accepting}
            className="flex-1 bg-blue-600 hover:bg-blue-700"
          >
            {accepting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Joining...
              </>
            ) : (
              <>
                <UserPlus className="mr-2 h-4 w-4" />
                Accept Invitation
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}