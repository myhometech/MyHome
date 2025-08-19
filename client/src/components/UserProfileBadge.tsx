import { useAuth } from '@/hooks/useAuth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SubscriptionBadge, SubscriptionTierDisplay, type SubscriptionTier } from '@/components/ui/subscription-badge';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { User, Settings, LogOut, CreditCard } from 'lucide-react';
import { useLocation } from 'wouter';

interface UserProfileBadgeProps {
  showDropdown?: boolean;
  variant?: 'full' | 'compact' | 'icon-only';
  className?: string;
}

export function UserProfileBadge({ 
  showDropdown = true, 
  variant = 'full',
  className = ''
}: UserProfileBadgeProps) {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  if (!isAuthenticated || !user) {
    return null;
  }

  const getInitials = (firstName?: string, lastName?: string) => {
    if (!firstName && !lastName) return 'U';
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { 
        method: 'POST',
        credentials: 'include'
      });
      window.location.href = '/';
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const userInitials = getInitials((user as any)?.firstName, (user as any)?.lastName);
  const userName = (user as any)?.firstName && (user as any)?.lastName 
    ? `${(user as any).firstName} ${(user as any).lastName}` 
    : (user as any)?.email;

  // Normalize subscription tier - map 'premium' to 'pro' for display
  const displayTier: SubscriptionTier = (user as any)?.subscriptionTier === 'premium' 
    ? 'pro' 
    : ((user as any)?.subscriptionTier as SubscriptionTier) || 'free';

  // Icon-only variant
  if (variant === 'icon-only') {
    const ProfileContent = (
      <div className={`relative ${className}`}>
        <Avatar className="h-8 w-8 border-2 border-white shadow-sm">
          <AvatarImage src={(user as any)?.profileImage} alt={userName} />
          <AvatarFallback className="text-xs font-semibold bg-blue-500 text-white">
            {userInitials}
          </AvatarFallback>
        </Avatar>
        <div className="absolute -bottom-1 -right-1">
          <SubscriptionBadge tier={displayTier} size="sm" showLabel={false} className="border-2 border-white" />
        </div>
      </div>
    );

    return showDropdown ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative p-0 rounded-full hover:bg-transparent">
            {ProfileContent}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="space-y-1">
              <p className="font-medium">{userName}</p>
              <div className="flex items-center gap-2">
                <SubscriptionTierDisplay tier={displayTier} compact={true} />
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setLocation('/settings')}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLocation('/pricing')}>
            <CreditCard className="mr-2 h-4 w-4" />
            Subscription
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="text-red-600">
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : ProfileContent;
  }

  // Compact variant
  if (variant === 'compact') {
    const ProfileContent = (
      <div className={`flex items-center gap-2 ${className}`}>
        <Avatar className="h-7 w-7 border border-gray-200">
          <AvatarImage src={(user as any)?.profileImage} alt={userName} />
          <AvatarFallback className="text-xs font-medium bg-blue-500 text-white">
            {userInitials}
          </AvatarFallback>
        </Avatar>
        <SubscriptionBadge tier={displayTier} size="sm" />
      </div>
    );

    return showDropdown ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="p-2 h-auto rounded-lg hover:bg-gray-50">
            {ProfileContent}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="space-y-1">
              <p className="font-medium">{userName}</p>
              <SubscriptionTierDisplay tier={displayTier} />
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setLocation('/settings')}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLocation('/pricing')}>
            <CreditCard className="mr-2 h-4 w-4" />
            Subscription
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="text-red-600">
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : ProfileContent;
  }

  // Full variant (default)
  const ProfileContent = (
    <div className={`flex items-center gap-3 p-2 rounded-lg ${className}`}>
      <Avatar className="h-10 w-10 border border-gray-200">
        <AvatarImage src={(user as any)?.profileImage} alt={userName} />
        <AvatarFallback className="font-medium bg-blue-500 text-white">
          {userInitials}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate text-gray-900">{userName}</p>
        <SubscriptionTierDisplay tier={displayTier} showUpgrade={displayTier === 'free'} />
      </div>
    </div>
  );

  return showDropdown ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="p-1 h-auto w-full justify-start hover:bg-gray-50">
          {ProfileContent}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="space-y-1">
            <p className="font-medium">{userName}</p>
            <p className="text-sm text-gray-600">{(user as any)?.email}</p>
            <SubscriptionTierDisplay tier={displayTier} />
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setLocation('/settings')}>
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setLocation('/pricing')}>
          <CreditCard className="mr-2 h-4 w-4" />
          Subscription
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="text-red-600">
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : ProfileContent;
}