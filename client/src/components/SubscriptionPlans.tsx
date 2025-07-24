import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Check, CreditCard, Crown, Star, Zap } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  interval: string | null;
  features: string[];
  stripePriceId: string | null;
}

interface SubscriptionStatus {
  tier: string;
  status: string;
  renewalDate?: Date | null;
  portalUrl?: string;
}

export default function SubscriptionPlans() {
  const [isLoading, setIsLoading] = useState(false);
  const queryClient = useQueryClient();

  // Fetch available plans
  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: ['/api/stripe/plans'],
    queryFn: async () => {
      const response = await fetch('/api/stripe/plans');
      if (!response.ok) {
        throw new Error('Failed to fetch subscription plans');
      }
      return response.json();
    },
  });

  // Fetch current subscription status
  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ['/api/stripe/subscription-status'],
    queryFn: async () => {
      const response = await fetch('/api/stripe/subscription-status');
      if (!response.ok) {
        throw new Error('Failed to fetch subscription status');
      }
      return response.json();
    },
  });

  // Create checkout session mutation
  const checkoutMutation = useMutation({
    mutationFn: async (priceId: string) => {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId,
          successUrl: `${window.location.origin}/settings?success=true`,
          cancelUrl: `${window.location.origin}/settings?canceled=true`,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create checkout session');
      }

      return response.json();
    },
    onSuccess: (data) => {
      // Redirect to Stripe Checkout
      window.location.href = data.url;
    },
    onError: (error) => {
      toast({
        title: 'Subscription Error',
        description: error.message || 'Failed to start subscription process',
        variant: 'destructive',
      });
    },
  });

  // Cancel subscription mutation
  const cancelMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/stripe/cancel-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to cancel subscription');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Subscription Canceled',
        description: 'Your subscription has been canceled. You can continue using premium features until the end of your billing period.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/stripe/subscription-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
    },
    onError: (error) => {
      toast({
        title: 'Cancellation Error',
        description: error.message || 'Failed to cancel subscription',
        variant: 'destructive',
      });
    },
  });

  const handleSubscribe = async (plan: SubscriptionPlan) => {
    // Only show the free plan message if user is explicitly clicking on free plan
    if (plan.id === 'free') {
      toast({
        title: 'Free Plan',
        description: 'You are already on the free plan!',
      });
      return;
    }

    if (!plan.stripePriceId) {
      toast({
        title: 'Configuration Error',
        description: 'This plan is not properly configured. Please contact support.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      await checkoutMutation.mutateAsync(plan.stripePriceId);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (window.confirm('Are you sure you want to cancel your subscription? You will continue to have access until the end of your billing period.')) {
      setIsLoading(true);
      try {
        await cancelMutation.mutateAsync();
      } finally {
        setIsLoading(false);
      }
    }
  };

  if (plansLoading || statusLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const plans: SubscriptionPlan[] = plansData?.plans || [];
  const status: SubscriptionStatus = statusData || { tier: 'free', status: 'inactive' };
  const isActive = status.status === 'active';
  const isPremium = status.tier === 'premium' && isActive;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight">Choose Your Plan</h2>
        <p className="text-muted-foreground">
          Unlock advanced features with our premium subscription
        </p>
      </div>

      {/* Current Status */}
      {isPremium && (
        <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-800 dark:text-green-200">
              <Crown className="h-5 w-5" />
              Premium Active
            </CardTitle>
            <CardDescription className="text-green-700 dark:text-green-300">
              {status.renewalDate && (
                <>Renews on {new Date(status.renewalDate).toLocaleDateString()}</>
              )}
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button
              onClick={handleCancelSubscription}
              variant="outline"
              disabled={isLoading}
              className="border-green-600 text-green-700 hover:bg-green-100 dark:border-green-400 dark:text-green-300 dark:hover:bg-green-900"
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Cancel Subscription
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Plans Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {plans.map((plan) => {
          const isCurrent = status.tier === plan.id;
          const isUpgrade = plan.id === 'premium' && status.tier === 'free';

          return (
            <Card
              key={plan.id}
              className={`relative ${
                plan.id === 'premium'
                  ? 'border-primary shadow-lg'
                  : 'border-border'
              }`}
            >
              {plan.id === 'premium' && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground">
                    <Star className="h-3 w-3 mr-1" />
                    Most Popular
                  </Badge>
                </div>
              )}

              <CardHeader className="text-center">
                <CardTitle className="flex items-center justify-center gap-2">
                  {plan.id === 'premium' ? (
                    <Crown className="h-5 w-5 text-primary" />
                  ) : (
                    <Zap className="h-5 w-5 text-muted-foreground" />
                  )}
                  {plan.name}
                </CardTitle>
                <CardDescription>{plan.description}</CardDescription>
                <div className="pt-4">
                  <span className="text-4xl font-bold">
                    £{plan.price}
                  </span>
                  {plan.interval && (
                    <span className="text-muted-foreground">/{plan.interval}</span>
                  )}
                </div>
              </CardHeader>

              <CardContent>
                <Separator className="mb-4" />
                <ul className="space-y-3">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter>
                {isCurrent && isPremium ? (
                  <div className="w-full space-y-2">
                    <p className="text-xs text-center text-muted-foreground">
                      Renews: {status.renewalDate ? new Date(status.renewalDate).toLocaleDateString() : 'Unknown'}
                    </p>
                    <Button
                      onClick={handleCancelSubscription}
                      variant="outline"
                      className="w-full"
                      disabled={isLoading}
                    >
                      <CreditCard className="h-4 w-4 mr-2" />
                      Cancel Subscription
                    </Button>
                  </div>
                ) : isCurrent ? (
                  <Button variant="secondary" className="w-full" disabled>
                    Current Plan
                  </Button>
                ) : (
                  <Button
                    onClick={() => handleSubscribe(plan)}
                    variant={plan.id === 'premium' ? 'default' : 'outline'}
                    className="w-full"
                    disabled={isLoading || checkoutMutation.isPending}
                  >
                    {plan.id === 'free' ? 'Downgrade' : 'Upgrade Now'}
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <div className="text-center text-sm text-muted-foreground">
        <p>
          All plans include secure document storage and basic OCR processing.
          Cancel anytime through the billing portal.
        </p>
      </div>
    </div>
  );
}