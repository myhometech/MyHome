import { Crown, Zap, Users, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SubscriptionTier = 'free' | 'beginner' | 'pro' | 'duo';

interface SubscriptionBadgeProps {
  tier: SubscriptionTier;
  className?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const tierConfig = {
  free: {
    label: 'Starter',
    icon: Star,
    colors: 'bg-gray-100 text-gray-600 border-gray-200',
    iconColors: 'text-gray-500'
  },
  beginner: {
    label: 'Starter',
    icon: Star,
    colors: 'bg-blue-50 text-blue-700 border-blue-200',
    iconColors: 'text-blue-600'
  },
  pro: {
    label: 'Pro',
    icon: Zap,
    colors: 'bg-purple-50 text-purple-700 border-purple-200',
    iconColors: 'text-purple-600'
  },
  duo: {
    label: 'Duo',
    icon: Users,
    colors: 'bg-amber-50 text-amber-700 border-amber-200',
    iconColors: 'text-amber-600'
  }
};

const sizeConfig = {
  sm: {
    container: 'px-2 py-1 text-xs',
    icon: 'h-3 w-3',
    gap: 'gap-1'
  },
  md: {
    container: 'px-3 py-1.5 text-sm',
    icon: 'h-4 w-4',
    gap: 'gap-1.5'
  },
  lg: {
    container: 'px-4 py-2 text-base',
    icon: 'h-5 w-5',
    gap: 'gap-2'
  }
};

export function SubscriptionBadge({ 
  tier, 
  className, 
  showLabel = true, 
  size = 'md' 
}: SubscriptionBadgeProps) {
  const config = tierConfig[tier];
  const sizeStyles = sizeConfig[size];
  const Icon = config.icon;

  return (
    <div className={cn(
      'inline-flex items-center rounded-full border font-medium',
      config.colors,
      sizeStyles.container,
      sizeStyles.gap,
      className
    )}>
      <Icon className={cn(sizeStyles.icon, config.iconColors)} />
      {showLabel && (
        <span className="font-semibold">{config.label}</span>
      )}
    </div>
  );
}

// Premium crown icon for special highlighting
interface PremiumCrownProps {
  className?: string;
  size?: number;
}

export function PremiumCrown({ className, size = 16 }: PremiumCrownProps) {
  return (
    <Crown 
      className={cn('text-amber-500', className)} 
      size={size}
    />
  );
}

// Usage examples and tier display component
interface SubscriptionTierDisplayProps {
  tier: SubscriptionTier;
  showUpgrade?: boolean;
  compact?: boolean;
}

export function SubscriptionTierDisplay({ 
  tier, 
  showUpgrade = false, 
  compact = false 
}: SubscriptionTierDisplayProps) {
  const isPremium = tier === 'pro' || tier === 'duo';

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <SubscriptionBadge tier={tier} size="sm" showLabel={false} />
        {isPremium && <PremiumCrown size={14} />}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <SubscriptionBadge tier={tier} size="md" />
      {isPremium && <PremiumCrown size={16} />}
      {showUpgrade && tier === 'free' && (
        <span className="text-xs text-gray-500 hover:text-blue-600 cursor-pointer">
          Upgrade
        </span>
      )}
    </div>
  );
}